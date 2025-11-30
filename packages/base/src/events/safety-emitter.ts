import { RingBuffer } from "@/data"
import type {
  LogQueryOptions,
  PerEventCap,
  PublicEventMap,
  SafetyEmitterOptions,
  SafetyLogEntry,
  SanitizedError,
} from "@/events"
import {
  DEFAULT_SAFETY_LOG_CAP,
  incrementCount,
  normalizeEventKeyForMap,
  sumMapValues,
} from "@/events"
import { emitDiagnosticWarning } from "@/node"
import type { BaseEventMap, EventKey } from "@repo/types"
import type Emittery from "emittery"
import type { JsonValue } from "type-fest"

export type MutableErrorCountsMap<EventMap extends BaseEventMap> = Map<EventKey<EventMap>, number>

export type ErrorCountsMap<EventMap extends BaseEventMap> = ReadonlyMap<EventKey<EventMap>, number>

export type SafetyLogsMap<EventMap extends BaseEventMap> = Map<
  EventKey<EventMap>,
  RingBuffer<SafetyLogEntry>
>

export type SafetyControlEmitter<EventMap extends BaseEventMap> = Emittery<PublicEventMap<EventMap>>

export type SafetyLogList = ReadonlyArray<SafetyLogEntry>

export type SafetyLogIterator = IterableIterator<SafetyLogEntry>

/**
 * SafetyEmitter: a standalone class that owns safety bookkeeping (error counts, safety logs).
 * This class is intended to be composed by `SafeEmitter` rather than inherited.
 *
 * Expects a specialized control emitter for control events only.
 * The emitter should be an instance of Emittery<PublicEventMap<EventMap>>.
 */
export class SafetyEmitter<EventMap extends BaseEventMap> {
  private _errorCounts: MutableErrorCountsMap<EventMap> = new Map()
  private _safetyLogs: SafetyLogsMap<EventMap> = new Map()

  private readonly _safetyLogCap: number
  private readonly _perEventCaps?: PerEventCap<EventMap>
  private readonly _sanitizeErrors: boolean
  private _safetyEnabled = true

  constructor(
    controlEmitter: SafetyControlEmitter<EventMap>,
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

  public getAllErrorCounts(): ErrorCountsMap<EventMap> {
    return new Map(this._errorCounts)
  }

  public getSafetyLogs(eventName?: PropertyKey): SafetyLogList {
    const key = eventName ? normalizeEventKeyForMap(eventName) : undefined
    return this.getSafetyLogForEvent(key)
  }

  public getSafetyLogForEvent(eventName?: PropertyKey, opts?: LogQueryOptions): SafetyLogList {
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

  public *getSafetyLogIterator(eventName?: PropertyKey): SafetyLogIterator {
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

  public reset(): void {
    resetCountsAndLogs(this._errorCounts, this._safetyLogs)
  }
}

export function recordListenerErrorEntry<EventMap extends BaseEventMap>(
  errorCounts: MutableErrorCountsMap<EventMap>,
  safetyLogs: SafetyLogsMap<EventMap>,
  perEventCaps: PerEventCap<EventMap> | undefined,
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

function getBufferForEvent<EventMap extends BaseEventMap>(
  safetyLogs: SafetyLogsMap<EventMap>,
  eventName?: PropertyKey,
) {
  if (!eventName) return undefined

  const key = normalizeEventKeyForMap(eventName) as EventKey<EventMap>
  return safetyLogs.get(key)
}

function collectLogs<EventMap extends BaseEventMap>(
  safetyLogs: SafetyLogsMap<EventMap>,
  eventName?: PropertyKey,
  opts?: LogQueryOptions,
): SafetyLogList {
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
  const all: SafetyLogEntry[] = []

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
 */
export function resetCountsAndLogs<K extends string>(
  errorCounts: Map<K, number>,
  safetyLogs: Map<K, RingBuffer<unknown>>,
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
