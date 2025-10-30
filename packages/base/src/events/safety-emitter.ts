// NOTE: file renamed from safety-emitter-3.ts — same contents, updated path.
import { RingBuffer } from '@/data'
import type { BaseEventMap } from '@repo/types'
import Emittery from 'emittery'
import type { JsonValue } from 'type-fest'
import { emitDiagnosticWarning } from '../node/diagnostics.js'
import { EventKey, internalPublicBus } from './events-types.js'

/**
 * Options used to configure the standalone safety manager.
 *
 * Generic by EventMap so `perEventCap` can be keyed by actual event names.
 */
export type SafetyEmitterOptions<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> = {
  safetyLogCap?: number
  sanitizeErrors?: boolean
  /** Whether safety bookkeeping is enabled for this instance */
  enabled?: boolean
  /** Optional per-event capacity overrides keyed by event name */
  perEventCap?: Partial<Record<EventKey<EventMap>, number>>
}

/** Utility type: string-keyed event name for an EventMap */
// EventKey is exported from './events-types.js'

/**
 * Sanitized error shapes. Either a trimmed Error-like shape, a stringified
 * representation, or any JSON-friendly value.
 */
type SanitizedErrorFields = {
  name?: string
  message?: string
  stackSnippet?: string
}

export type SanitizedError = SanitizedErrorFields | { asString: string } | JsonValue

/** Default maximum number of safety log entries to keep per event. */
const DEFAULT_SAFETY_LOG_CAP = 100 as const

/**
 * SafetyEmitter: a standalone class that owns safety bookkeeping (error counts, safety logs).
 * This class is intended to be composed by `SafeEmitter` rather than inherited.
 */
/**
 * Usage (composition):
 *
 * ```ts
 * import { SafeEmitter } from './safe-emitter.js'
 * // SafeEmitter composes the SafetyEmitter internally and exposes safety accessors
 * const e = new SafeEmitter()
 * e.setSafetyEnabled(true)
 *
 * // Advanced: construct the standalone manager for test harnesses or custom buses
 * import { SafetyEmitter } from './safety-emitter.js'
 * import { internalPublicBus } from './events-types.js'
 * const manager = new SafetyEmitter(internalPublicBus(myEmitter), { safetyLogCap: 50 })
 * ```
 */
export class SafetyEmitter<EventMap extends BaseEventMap<unknown[]>> {
  private _errorCounts: Map<EventKey<EventMap>, number> = new Map()

  private _safetyLogs: Map<
    EventKey<EventMap>,
    RingBuffer<{ timestamp: number; error: unknown; listener: string }>
  > = new Map()

  private readonly _safetyLogCap: number

  private readonly _perEventCaps?: Partial<Record<EventKey<EventMap>, number>>

  private readonly _sanitizeErrors: boolean

  private _safetyEnabled = true

  constructor(
    pub?: ReturnType<typeof internalPublicBus<EventMap>>,
    opts?: SafetyEmitterOptions<EventMap>,
  ) {
    // If no public bus is provided, create a fresh Emittery instance and
    // wrap it with the typed helper so the internal control listeners have
    // proper typings without any `any` casts.
    const publicBus = pub ?? internalPublicBus<EventMap>(new Emittery())
    this._safetyLogCap = opts?.safetyLogCap ?? DEFAULT_SAFETY_LOG_CAP
    this._sanitizeErrors = !!opts?.sanitizeErrors
    this._perEventCaps = opts?.perEventCap
    this._safetyEnabled = opts?.enabled ?? true

    // Register private control listeners on the provided internal public bus
    publicBus.on('resetErrorCounts', ([eventName]: [string?]) => {
      this._resetErrorCounts(eventName)
    })
    publicBus.on('clearSafetyLogs', ([eventName]: [string?]) => {
      this._clearSafetyLogs(eventName)
    })
    publicBus.on('enableSafeMode', ([enabled]: [boolean]) => {
      this._safetyEnabled = enabled
    })
  }

  private _resetErrorCounts(eventName?: string): void {
    resetCountsAndLogs(this._errorCounts, this._safetyLogs, eventName)
  }

  private _clearSafetyLogs(eventName?: string): void {
    clearSafetyLogsFor(this._safetyLogs, eventName)
  }

  public recordListenerErrorFor(
    eventName: PropertyKey,
    error: unknown,
    listenerName?: string,
  ): void {
    if (!this._safetyEnabled) return
    try {
      recordListenerErrorEntry<EventMap>(
        this._errorCounts,
        this._safetyLogs,
        this._perEventCaps,
        this._safetyLogCap,
        this._sanitizeErrors,
        eventName,
        error,
        listenerName,
      )
    } catch (err) {
      emitDiagnosticWarning('[SafetyEmitter] Failed to record listener error', err)
    }
  }

  // Public accessors (same API as the old SafetyEmitter)
  public getErrorCount(eventName?: PropertyKey): number {
    if (!eventName) return sumMapValues(this._errorCounts)
    const raw = normalizeEventKey(eventName) ?? String(eventName)
    return this._errorCounts.get(raw as EventKey<EventMap>) ?? 0
  }

  public getAllErrorCounts(): ReadonlyMap<EventKey<EventMap>, number> {
    return new Map(this._errorCounts)
  }

  public getSafetyLogs(
    eventName?: PropertyKey,
  ): ReadonlyArray<{ timestamp: number; error: unknown; listener: string }> {
    return this.getSafetyLogForEvent(eventName)
  }

  public getSafetyLogForEvent(
    eventName?: PropertyKey,
    opts?: { limit?: number; newestFirst?: boolean },
  ): ReadonlyArray<{ timestamp: number; error: unknown; listener: string }> {
    return collectLogs<EventMap>(this._safetyLogs, eventName, opts)
  }

  public getSafetyLogSize(eventName?: PropertyKey): number {
    if (eventName) return getBufferForEvent<EventMap>(this._safetyLogs, eventName)?.size ?? 0
    let total = 0
    for (const b of this._safetyLogs.values()) total += b.size
    return total
  }

  public getSafetyLogCapacity(): number {
    return this._safetyLogCap
  }

  public *getSafetyLogIterator(
    eventName?: PropertyKey,
  ): IterableIterator<{ timestamp: number; error: unknown; listener: string }> {
    if (eventName) {
      const buf = this._safetyLogs.get(String(eventName) as EventKey<EventMap>)
      if (!buf) return
      yield* buf
      return
    }
    for (const b of this._safetyLogs.values()) yield* b
  }

  public resetErrorCounts(eventName?: PropertyKey): void {
    this._resetErrorCounts(eventName ? String(eventName) : undefined)
  }

  public clearSafetyLogs(eventName?: PropertyKey): void {
    this._clearSafetyLogs(eventName ? String(eventName) : undefined)
  }

  public isSafetyEnabled(): boolean {
    return this._safetyEnabled
  }

  public setSafetyEnabled(enabled: boolean): void {
    this._safetyEnabled = enabled
  }
}

// Note: do NOT alias SafetyManager to SafetyEmitter here. We provide a small
// compatibility subclass below that extends the original SafeEmitter and
// delegates to the composed SafetyManager. This preserves the old API surface
// (classes that `extends SafetyEmitter`) while using composition internally.

// --- helper implementations (kept after class to match request) ----------------
/** Normalize a PropertyKey into a string key suitable for Map lookups. */
function normalizeEventKey(k?: PropertyKey): string | undefined {
  if (k === undefined || k === null) return undefined
  return String(k)
}

/**
 * Reset counts and logs either for a single event key or for all events.
 * Generic over the map key type so it can be reused by the SafetyManager.
 */
function resetCountsAndLogs<K extends string>(
  errorCounts: Map<K, number>,
  safetyLogs: Map<K, RingBuffer<any>>,
  eventName?: string,
): void {
  if (eventName) {
    const k = eventName as K
    errorCounts.delete(k)
    safetyLogs.delete(k)
  } else {
    errorCounts.clear()
    safetyLogs.clear()
  }
}

/** Clear safety logs for a single event or all events. */
function clearSafetyLogsFor<K extends string>(
  safetyLogs: Map<K, RingBuffer<any>>,
  eventName?: string,
): void {
  if (eventName) {
    const k = eventName as K
    safetyLogs.delete(k)
  } else {
    safetyLogs.clear()
  }
}

/** Increment a numeric value stored in a Map<K, number> and return the new value. */
function incrementCount<K extends string>(map: Map<K, number>, key: K, delta = 1): number {
  const next = (map.get(key) ?? 0) + delta
  map.set(key, next)
  return next
}

/** Sum numeric values in a map. */
function sumMapValues<K>(m: Map<K, number>): number {
  let total = 0
  for (const v of m.values()) total += v
  return total
}

/**
 * Record a listener/emit error entry into counts and ring buffers.
 * Generic over EventMap so callers can pass typed maps.
 */
function recordListenerErrorEntry<EventMap extends BaseEventMap<unknown[]>>(
  errorCounts: Map<EventKey<EventMap>, number>,
  safetyLogs: Map<
    EventKey<EventMap>,
    RingBuffer<{ timestamp: number; error: unknown; listener: string }>
  >,
  perEventCaps: Partial<Record<EventKey<EventMap>, number>> | undefined,
  defaultCap: number,
  sanitizeErrors: boolean,
  eventName: PropertyKey,
  error: unknown,
  listenerName?: string,
): void {
  const raw = normalizeEventKey(eventName) ?? String(eventName)
  const key = raw as EventKey<EventMap>
  incrementCount(errorCounts as Map<any, number>, key as any, 1)
  const storedError = sanitizeErrors ? sanitizeError(error) : error
  const entry = { timestamp: Date.now(), error: storedError, listener: listenerName ?? 'unknown' }
  let buf = safetyLogs.get(key)
  if (!buf) {
    const cap = perEventCaps?.[key] ?? defaultCap
    buf = new RingBuffer<{ timestamp: number; error: unknown; listener: string }>(cap)
    safetyLogs.set(key, buf)
  }
  buf.push(entry)
}

/** Sanitize an unknown error into a small JSON-friendly shape to avoid retaining
 * large object graphs in the ring buffer. Returns either an Error-like shape
 * (name/message/stackSnippet) or an { asString } representation for non-Errors.
 */
function sanitizeError(e: unknown): SanitizedError {
  if (e instanceof Error) {
    const { name, message, stack } = e
    return {
      name,
      message,
      stackSnippet: stack?.split('\n').slice(0, 3).join('\n'),
    }
  }

  try {
    return { asString: JSON.stringify(e) }
  } catch {
    return { asString: String(e) }
  }
}

/** Return the ring buffer for an event name (or undefined). */
function getBufferForEvent<EventMap extends BaseEventMap<unknown[]>>(
  safetyLogs: Map<
    EventKey<EventMap>,
    RingBuffer<{ timestamp: number; error: unknown; listener: string }>
  >,
  eventName?: PropertyKey,
) {
  if (!eventName) return undefined
  const key = String(eventName) as EventKey<EventMap>
  return safetyLogs.get(key)
}

/**
 * Collect log entries either for a specific event or across all events.
 * Returns newestFirst ordering when requested and respects a numeric limit.
 */
function collectLogs<EventMap extends BaseEventMap<unknown[]>>(
  safetyLogs: Map<
    EventKey<EventMap>,
    RingBuffer<{ timestamp: number; error: unknown; listener: string }>
  >,
  eventName?: PropertyKey,
  opts?: { limit?: number; newestFirst?: boolean },
): ReadonlyArray<{ timestamp: number; error: unknown; listener: string }> {
  const limit = opts?.limit === undefined ? Infinity : Math.max(0, Math.floor(opts.limit))
  const newestFirst = !!opts?.newestFirst

  if (eventName) {
    const buf = getBufferForEvent<EventMap>(safetyLogs, eventName)
    if (!buf) return []
    const arr = buf.toArray()
    const start = limit === Infinity ? 0 : Math.max(0, arr.length - limit)
    const slice = arr.slice(start)
    return newestFirst ? slice.reverse() : slice
  }

  const all: Array<{ timestamp: number; error: unknown; listener: string }> = []
  for (const b of safetyLogs.values()) all.push(...b.toArray())
  if (limit !== Infinity) {
    const start = Math.max(0, all.length - limit)
    const slice = all.slice(start)
    return newestFirst ? slice.reverse() : slice
  }
  return newestFirst ? all.reverse() : all
}

// -----------------------------------------------------------------------------

// Compatibility subclass: preserves the previous exported class name and API
// shape so existing code that `extends SafetyEmitter` continues to work while
// the implementation uses composition under-the-hood.

// (compatibility subclass has been removed — `SafeEmitter` is the base class and
// composes a `SafetyManager` instance; consumers should extend `SafeEmitter`.)
