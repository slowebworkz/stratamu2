import { RingBuffer } from "@/data"
import type {
  EventKey,
  PerEventCap,
  PublicEventMap,
  SafetyEmitterOptions,
  SanitizedError,
} from "@/events"
import { incrementCount, normalizeEventKeyForMap, sumMapValues } from "@/events"
import { emitDiagnosticWarning } from "@/node"
import type { BaseEventMap } from "@repo/types"
import type Emittery from "emittery"
import type { JsonValue } from "type-fest"

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
/**
 * SafetyEmitter: expects a specialized control emitter for control events only.
 * The emitter should be an instance of Emittery<PublicEventMap<EventMap>>.
 */
export class SafetyEmitter<EventMap extends BaseEventMap<unknown[]>> {
  private _errorCounts: Map<EventKey<EventMap>, number> = new Map()
  private _safetyLogs: Map<
    EventKey<EventMap>,
    RingBuffer<{ timestamp: number; error: unknown; listener: string }>
  > = new Map()

  private readonly _safetyLogCap: number
  private readonly _perEventCaps?: PerEventCap<EventMap>
  private readonly _sanitizeErrors: boolean
  private _safetyEnabled = true

  /**
   * @param controlEmitter - A specialized emitter for control events (resetErrorCounts, clearSafetyLogs, enableSafeMode)
   * @param opts - SafetyEmitter options
   */
  constructor(
    controlEmitter: Emittery<PublicEventMap<EventMap>>,
    opts?: SafetyEmitterOptions<EventMap>,
  ) {
    this._safetyLogCap = opts?.safetyLogCap ?? DEFAULT_SAFETY_LOG_CAP
    this._sanitizeErrors = !!opts?.sanitizeErrors
    this._perEventCaps = opts?.perEventCap
    this._safetyEnabled = opts?.enabled ?? true

    // Register private control listeners on the provided control emitter
    controlEmitter.on("resetErrorCounts", ([eventName]: [string?]) => {
      this._resetErrorCounts(eventName)
    })
    controlEmitter.on("clearSafetyLogs", ([eventName]: [string?]) => {
      this._clearSafetyLogs(eventName)
    })
    controlEmitter.on("enableSafeMode", ([enabled]: [boolean]) => {
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
      emitDiagnosticWarning("[SafetyEmitter] Failed to record listener error", err)
    }
  }

  // Public accessors (same API as the old SafetyEmitter)
  public getErrorCount(eventName?: PropertyKey): number {
    if (!eventName) return sumMapValues(this._errorCounts)
    const key = normalizeEventKeyForMap(eventName)
    if (!key) return 0
    return this._errorCounts.get(key as EventKey<EventMap>) ?? 0
  }

  public getAllErrorCounts(): ReadonlyMap<EventKey<EventMap>, number> {
    return new Map(this._errorCounts)
  }

  public getSafetyLogs(
    eventName?: PropertyKey,
  ): ReadonlyArray<{ timestamp: number; error: unknown; listener: string }> {
    const key = eventName ? normalizeEventKeyForMap(eventName) : undefined
    return this.getSafetyLogForEvent(key)
  }

  public getSafetyLogForEvent(
    eventName?: PropertyKey,
    opts?: { limit?: number; newestFirst?: boolean },
  ): ReadonlyArray<{ timestamp: number; error: unknown; listener: string }> {
    const key = eventName ? normalizeEventKeyForMap(eventName) : undefined
    if (key) {
      const buf = this._safetyLogs.get(key as EventKey<EventMap>)
      if (!buf) return []
      const arr = buf.toArray()
      const limit =
        opts?.limit === undefined
          ? Number.POSITIVE_INFINITY
          : Math.max(0, Math.floor(opts?.limit ?? 0))
      const newestFirst = !!opts?.newestFirst
      const start = limit === Number.POSITIVE_INFINITY ? 0 : Math.max(0, arr.length - limit)
      const slice = arr.slice(start)
      return newestFirst ? slice.reverse() : slice
    }
    // If no eventName, collect all logs
    return collectLogs<EventMap>(this._safetyLogs, undefined, opts)
  }

  public getSafetyLogSize(eventName?: PropertyKey): number {
    if (eventName) {
      const key = normalizeEventKeyForMap(eventName)
      if (!key) return 0
      return getBufferForEvent<EventMap>(this._safetyLogs, key)?.size ?? 0
    }
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
      const key = normalizeEventKeyForMap(eventName)
      const buf = key ? this._safetyLogs.get(key as EventKey<EventMap>) : undefined
      if (!buf) return
      yield* buf
      return
    }
    for (const b of this._safetyLogs.values()) yield* b
  }

  public resetErrorCounts(eventName?: PropertyKey): void {
    const key = eventName ? normalizeEventKeyForMap(eventName) : undefined
    this._resetErrorCounts(key)
  }

  public clearSafetyLogs(eventName?: PropertyKey): void {
    const key = eventName ? normalizeEventKeyForMap(eventName) : undefined
    this._clearSafetyLogs(key)
  }

  public isSafetyEnabled(): boolean {
    return this._safetyEnabled
  }

  public setSafetyEnabled(enabled: boolean): void {
    this._safetyEnabled = enabled
  }

  /**
   * Reset all error counts and safety logs for all events.
   */
  public reset(): void {
    resetCountsAndLogs(this._errorCounts, this._safetyLogs)
  }
}

export function recordListenerErrorEntry<EventMap extends BaseEventMap<unknown[]>>(
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
  const key = normalizeEventKeyForMap(eventName) as EventKey<EventMap>

  incrementCount(errorCounts, key, 1)

  const storedError = sanitizeErrors ? sanitizeError(error) : error
  const entry = {
    timestamp: Date.now(),
    error: storedError,
    listener: listenerName ?? "unknown",
  }

  const cap = perEventCaps?.[key] ?? defaultCap
  let buf = safetyLogs.get(key)

  if (!buf) {
    buf = new RingBuffer<typeof entry>(cap)
    safetyLogs.set(key, buf)
  }

  buf.push(entry)
}

export function clearSafetyLogsFor<K extends string>(
  safetyLogs: Map<K, RingBuffer<unknown>>,
  eventName?: K,
): void {
  if (eventName) {
    safetyLogs.delete(eventName)
  } else {
    safetyLogs.clear()
  }
}

function sanitizeError(e: unknown): SanitizedError {
  if (e instanceof Error) {
    const { name, message, stack } = e
    return {
      kind: "Error",
      name,
      message,
      stackSnippet: stack?.split("\n").slice(0, 3).join("\n"),
    }
  }
  try {
    return { kind: "Json", value: JSON.parse(JSON.stringify(e)) as JsonValue }
  } catch {
    return { kind: "String", value: String(e) }
  }
}

function getBufferForEvent<EventMap extends BaseEventMap<unknown[]>>(
  safetyLogs: Map<
    EventKey<EventMap>,
    RingBuffer<{ timestamp: number; error: unknown; listener: string }>
  >,
  eventName?: PropertyKey,
) {
  if (!eventName) return undefined

  const key = normalizeEventKeyForMap(eventName) as EventKey<EventMap>
  return safetyLogs.get(key)
}

function collectLogs<EventMap extends BaseEventMap<unknown[]>>(
  safetyLogs: Map<
    EventKey<EventMap>,
    RingBuffer<{ timestamp: number; error: unknown; listener: string }>
  >,
  eventName?: PropertyKey,
  opts?: { limit?: number; newestFirst?: boolean },
): ReadonlyArray<{ timestamp: number; error: unknown; listener: string }> {
  const limit =
    opts?.limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(opts.limit))
  const newestFirst = !!opts?.newestFirst

  const sliceArray = <T>(arr: T[]) => {
    const start = limit === Number.POSITIVE_INFINITY ? 0 : Math.max(0, arr.length - limit)
    const sliced = arr.slice(start)
    return newestFirst ? sliced.reverse() : sliced
  }

  if (eventName) {
    const buf = getBufferForEvent<EventMap>(safetyLogs, eventName)
    if (!buf) return []
    return sliceArray(buf.toArray())
  }

  // Global collection
  const all: { timestamp: number; error: unknown; listener: string }[] = []

  // Flatten all buffers
  for (const buf of safetyLogs.values()) {
    all.push(...buf.toArray())
  }

  if (newestFirst) all.reverse()
  if (limit !== Number.POSITIVE_INFINITY && all.length > limit) {
    return all.slice(0, limit)
  }

  return all
}

/**
 * Reset error counts and safety logs for a specific event or all events.
 *
 * - If eventName is provided, only that event's counts and logs are cleared.
 * - If eventName is omitted or undefined, all counts and logs are cleared.
 * - Accepts any PropertyKey (string, number, symbol, or undefined) and normalizes internally.
 */
export function resetCountsAndLogs<K extends string>(
  errorCounts: Map<K, number>,
  safetyLogs: Map<K, RingBuffer<any>>,
  eventName?: PropertyKey,
): void {
  const key = normalizeEventKeyForMap(eventName) as K | undefined
  if (key) {
    errorCounts.delete(key)
    safetyLogs.delete(key)
  } else {
    errorCounts.clear()
    safetyLogs.clear()
  }
}
