import type { Awaitable, BaseEventMap } from '@repo/types'
import Emittery from 'emittery'
import type { ReadonlyDeep } from 'type-fest'
import type {
  AllEvents,
  CancelablePromise,
  EventKey,
  ExtractPayload,
  WrappedCancelable,
} from './index.js'
import {
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_REMOVE_WARN,
  InternalEventMap,
  internalPublicBus,
  isInternalEvent,
  isPublicEvent,
  SafetyEmitter as SafetyManager,
  type SafetyEmitterOptions,
} from './index.js'

import type { ErrorCounts, ListenerCounts, LogSizes } from './types.js'

/**
 * Default metrics shape returned by `getEventMetrics()`.
 * Kept non-generic and string-keyed for simplicity.
 */
export type EventMetrics<EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>> = {
  listenerCounts: ListenerCounts<EventKey<EventMap>>
  safety: {
    errorCounts: ErrorCounts<EventKey<EventMap>>
    logSizes: LogSizes<EventKey<EventMap>>
    capacity: number
    enabled: boolean
  }
}

/**
 * Deeply immutable event metrics type.
 */
export type ReadonlyEventMetrics<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> = ReadonlyDeep<EventMetrics<EventMap>>

/**
 * Indicates if the environment is development (not production).
 */
const DEV_MODE = (process?.env?.NODE_ENV ?? 'development') !== 'production'

/**
 * Type-safe event emitter with internal diagnostics and error handling.
 *
 * @template EventMap extends BaseEventMap<unknown[]>
 */
export abstract class SafeEmitter<EventMap extends BaseEventMap<unknown[]>> {
  /**
   * Global bus for internal diagnostics and error events.
   * @private
   */
  private static readonly global = new Emittery<InternalEventMap<any>>()

  /**
   * Emit a diagnostic or error event on the global bus.
   * @param event Internal event name
   * @param payload Event payload
   */
  public static report(event: keyof InternalEventMap<any>, payload: any) {
    SafeEmitter.global.emit(event as any, payload)
  }

  /**
   * Listen for global internal events.
   * @template K
   * @param event Internal event name
   * @param listener Listener function
   * @returns Unsubscribe function
   */
  public static onGlobal<K extends keyof InternalEventMap<any>>(
    event: K,
    listener: (payload: InternalEventMap<any>[K]) => Awaitable,
  ) {
    return SafeEmitter.global.on(event as any, listener)
  }

  /**
   * Internal bus for public and internal events.
   * Protected so subclasses (e.g. SafetyEmitter) can register internal control listeners.
   */
  protected readonly _public: Emittery<AllEvents<EventMap>> = new Emittery<AllEvents<EventMap>>()

  // internal SafetyEmitter (composition). Instantiated by default so safety
  // bookkeeping is enabled for all emitters unless explicitly disabled via
  // options. Typed via the internalPublicBus helper to avoid `any` casts.
  private readonly _safety: SafetyManager<EventMap>

  /** Protected accessor for subclasses to reach the internal safety emitter (for compatibility). */
  protected get _safetyManager(): SafetyManager<EventMap> {
    return this._safety
  }

  /**
   * Maps event names to listener maps for safe removal.
   * @private
   */
  private readonly _listenerMaps = new Map<
    keyof AllEvents<EventMap>,
    WeakMap<(data: any) => Awaitable, (data: any) => Awaitable>
  >()

  /**
   * Register a listener for an event.
   * @template K
   * @param event Event name
   * @param listener Listener function
   * @returns Unsubscribe function
   */
  constructor() {
    // Compose the safety manager with hardcoded presets (no user config)
    this._safety = new SafetyManager<EventMap>(
      internalPublicBus<EventMap>(this),
      { sanitizeErrors: true, safetyLogCap: 100 }
    )
  }

  /**
   * Backwards-compatible protected hook: record a listener error. Delegates
   * to the composed `SafetyEmitter` manager so tests/consumers that call the
   * old protected method name continue to work.
   */
  protected recordListenerError(eventName: string, error: unknown, listenerName: string): void {
    this._safety.recordListenerErrorFor(eventName, error, listenerName)
  }

  /** Read-only snapshot of error counts (compatibility getter). */
  protected get _errorCounts(): Record<string, number> {
    const m = this._safety.getAllErrorCounts()
    const out: Record<string, number> = {}
    for (const [k, v] of m) out[String(k)] = v
    return out
  }

  /** Read-only snapshot of safety logs (compatibility getter). */
  protected get _safetyLogs(): Record<
    string,
    Array<{ timestamp: number; error: unknown; listener: string }>
  > {
    const out: Record<string, Array<{ timestamp: number; error: unknown; listener: string }>> = {}
    const counts = this._safety.getAllErrorCounts()
    for (const k of counts.keys()) {
      // getSafetyLogForEvent returns a readonly array; copy to a mutable array
      out[String(k)] = Array.from(this._safety.getSafetyLogForEvent(String(k)))
    }
    return out
  }

  /** Convenience proxy to the composed manager's enabled flag. */
  protected get _safetyEnabled(): boolean {
    return this._safety.isSafetyEnabled()
  }

  protected set _safetyEnabled(enabled: boolean) {
    this._safety.setSafetyEnabled(enabled)
  }

  /** Shape returned from `getEventMetrics()` describing listener and safety state. */

  /**
   * Default metrics implementation. Returns quick, non-allocating aggregates:
   * - listenerCounts.total: total listener count
   * - listenerCounts[<event>]: per-event counts for events that have been
   *   registered via this emitter's public listener map
   * - safety.errorCounts: per-event error counts from the composed safety manager
   * - safety.logSizes: per-event ring-buffer sizes (plus total under key "__total")
   * - safety.capacity: configured per-event capacity
   * - safety.enabled: whether safety bookkeeping is enabled
   *
   * Subclasses may override this to provide richer metrics.
   */
  public getEventMetrics(): ReadonlyEventMetrics<EventMap> {
    const listenerCounts: Record<EventKey<EventMap> | 'total', number> = {} as Record<
      EventKey<EventMap> | 'total',
      number
    >
    // total listeners across all events
    try {
      listenerCounts.total = this._public.listenerCount()
    } catch {
      listenerCounts.total = 0
    }

    // per-event counts for events we have tracked in _listenerMaps
    for (const k of this._listenerMaps.keys()) {
      try {
        const name = String(k as any)
        listenerCounts[name as EventKey<EventMap>] = this._public.listenerCount(k as any)
      } catch {
        // ignore per-event failures
      }
    }

    const errorCountsMap = this._safety.getAllErrorCounts()
    const errorCounts: Record<EventKey<EventMap>, number> = {} as Record<EventKey<EventMap>, number>
    for (const [k, v] of errorCountsMap) errorCounts[String(k) as EventKey<EventMap>] = v

    const logSizes: Record<EventKey<EventMap> | '__total', number> = {} as Record<
      EventKey<EventMap> | '__total',
      number
    >
    // per-event sizes (keys present in errorCountsMap), plus total
    for (const k of errorCountsMap.keys()) {
      logSizes[String(k) as EventKey<EventMap>] = this._safety.getSafetyLogSize(String(k))
    }
    logSizes.__total = this._safety.getSafetyLogSize()

    return {
      listenerCounts: listenerCounts as ReadonlyDeep<ListenerCounts<EventKey<EventMap>>>,
      safety: {
        errorCounts: errorCounts as ReadonlyDeep<ErrorCounts<EventKey<EventMap>>>,
        logSizes: logSizes as ReadonlyDeep<LogSizes<EventKey<EventMap>>>,
        capacity: this._safety.getSafetyLogCapacity(),
        enabled: this._safety.isSafetyEnabled(),
      },
    }
  }

  public on<K extends keyof AllEvents<EventMap>>(
    event: K | readonly K[],
    listener: (data: AllEvents<EventMap>[K]) => Awaitable,
    options?: { signal?: AbortSignal },
  ) {
    // Support subscribing to multiple events (array form) while keeping
    // our listener-mapping bookkeeping per-event so `off(original)` works.
    const events = Array.isArray(event) ? event : [event]

    const safeListener = async (data: AllEvents<EventMap>[K]) => {
      try {
        await listener(data)
      } catch (error) {
        const actual = normalizeEventName(events as readonly any[])
        this.onListenerError(actual as any, error, { type: 'on', listener, emitter: this })
      }
    }

    for (const e of events) {
      let map = this._listenerMaps.get(e)
      if (!map) {
        map = new WeakMap()
        this._listenerMaps.set(e, map)
      }
      map.set(listener, safeListener)
    }

    return this._public.on(event as any, safeListener, options)
  }

  /**
   * Register a one-time listener for an event.
   * @template K
   * @param event Event name
   * @param listener Listener function
   * @returns Promise resolving to event payload
   */
  public once<K extends keyof AllEvents<EventMap>>(
    event: K,
    listener: (data: AllEvents<EventMap>[K]) => Awaitable,
    options?: { signal?: AbortSignal },
  ): CancelablePromise<AllEvents<EventMap>[K]> {
    const originalPromise = this._public.once(event) as CancelablePromise<AllEvents<EventMap>[K]>

    const notify = (error: unknown) =>
      this.onListenerError(event, error, { type: 'once', listener, emitter: this })

    return createCancelableOnce(originalPromise, listener as any, options, notify)
  }

  /**
   * Remove a listener for an event.
   * @template K
   * @param event Event name
   * @param listener Listener function
   */
  public off<K extends keyof AllEvents<EventMap>>(
    event: K,
    listener: (data: AllEvents<EventMap>[K]) => Awaitable,
  ) {
    const map = this._listenerMaps.get(event)
    const safeListener = map?.get(listener)
    if (safeListener) {
      if (map) {
        map.delete(listener)
      }
      const result = this._public.off(
        event,
        safeListener as (data: AllEvents<EventMap>[K]) => Awaitable,
      )
      fireAndForgetInternal(
        this._public,
        INTERNAL_ON_LISTENER_REMOVED,
        [
          event as keyof EventMap,
          listener,
          { emitter: this },
        ] as AllEvents<EventMap>[typeof INTERNAL_ON_LISTENER_REMOVED],
        this,
      )
      return result
    } else if (DEV_MODE) {
      fireAndForgetInternal(
        this._public,
        INTERNAL_ON_REMOVE_WARN,
        [
          event as keyof EventMap,
          listener,
          { emitter: this },
        ] as AllEvents<EventMap>[typeof INTERNAL_ON_REMOVE_WARN],
        this,
      )
    }
  }

  /**
   * Emit an event to all listeners, with error handling.
   * @template K
   * @param event Event name
   * @param args Event payload
   */
  public async emit<K extends keyof AllEvents<EventMap>>(
    event: K,
    ...args: AllEvents<EventMap>[K] extends undefined ? [] : [AllEvents<EventMap>[K]]
  ): Promise<void> {
    await emitWithErrorHandling(
      args,
      (data) => this._public.emitSerial(event, data as AllEvents<EventMap>[K]),
      (error) => this.onEmitError(event, error),
    )
  }

  /**
   * Emit an event and return success/failure.
   * @template K
   * @param event Event name
   * @param args Event payload
   * @returns True if successful, false if error
   */
  public async emitSafe<K extends keyof AllEvents<EventMap>>(
    event: K,
    ...args: AllEvents<EventMap>[K] extends undefined ? [] : [AllEvents<EventMap>[K]]
  ): Promise<boolean> {
    try {
      await this.emit(event, ...args)
      return true
    } catch {
      // already reported
      return false
    }
  }

  /**
   * Return the number of listeners. Accepts no arg, a single event name, or an array of event names.
   * This is a small public helper used by extended emitters that maintain extra listener lists.
   */
  public listenerCount(
    eventName?: keyof AllEvents<EventMap> | readonly (keyof AllEvents<EventMap>)[],
  ): number {
    if (eventName === undefined) {
      return this._public.listenerCount()
    }
    if (Array.isArray(eventName)) {
      let total = 0
      for (const name of eventName) total += this._public.listenerCount(name as any)
      return total
    }
    return this._public.listenerCount(eventName as any)
  }

  /**
   * Handle errors thrown by listeners.
   * @param eventName Event name
   * @param error Error thrown
   * @param context Listener context
   * @protected
   */
  protected onListenerError(
    eventName: keyof AllEvents<EventMap>,
    error: unknown,
    context: {
      type: 'on' | 'once'
      listener?: (...args: any[]) => Awaitable
      hasFilter?: boolean
      emitter?: unknown
    },
  ) {
    // Only emit internal error event for public events, not internal/private events
    if (isPublicEvent<EventMap>(eventName)) {
      // Delegate to internal safety manager if present; keep try/catch to
      // avoid bookkeeping failures affecting the emitter.
      try {
        this._safety?.recordListenerErrorFor(
          eventName as any,
          error,
          (context.listener && context.listener.name) || undefined,
        )
      } catch {
        // ignore errors in bookkeeping
        void 0
      }

      fireAndForgetInternal(
        this._public,
        INTERNAL_ON_LISTENER_ERROR,
        [eventName, error, context] as AllEvents<EventMap>[typeof INTERNAL_ON_LISTENER_ERROR],
        this,
      )
    } else {
      if (DEV_MODE) {
        console.error('[SafeEmitter] Internal event listener error:', { eventName, error, context })
      }
    }
  }

  /**
   * Handle errors thrown during event emission.
   * @param eventName Event name
   * @param error Error thrown
   * @param context Emission context
   * @protected
   */
  protected onEmitError(
    eventName: keyof AllEvents<EventMap>,
    error: unknown,
    context?: { emitter?: unknown },
  ) {
    if (isPublicEvent<EventMap>(eventName)) {
      try {
        this._safety?.recordListenerErrorFor(eventName as any, error)
      } catch {
        void 0
      }

      fireAndForgetInternal(
        this._public,
        INTERNAL_ON_EMIT_ERROR,
        [
          eventName,
          error,
          { ...(context || {}), emitter: this },
        ] as AllEvents<EventMap>[typeof INTERNAL_ON_EMIT_ERROR],
        this,
      )
    }
  }

  /**
   * Hook for subclasses to record listener/emit errors. Default is no-op.
   * SafetyEmitter overrides this to maintain error counts/logs.
   */
  protected recordListenerErrorFor(
    eventName: PropertyKey,
    error: unknown,
    listenerName?: string,
  ): void {
    // Delegate to internal safety emitter if present. Subclasses may override
    // this hook; keeping it protected preserves the original extension point.
    this._safety?.recordListenerErrorFor(eventName, error, listenerName)
  }

  // --- Public safety accessors (compatibility proxies) --------------------
  // These forward to the composed SafetyManager when present. Returning
  // defaults when the manager is absent keeps callers safe.

  public getErrorCount(eventName?: PropertyKey): number {
    return this._safety.getErrorCount(eventName)
  }

  public getAllErrorCounts(): ReadonlyMap<any, number> {
    return this._safety.getAllErrorCounts()
  }

  public getSafetyLogs(eventName?: PropertyKey) {
    return this._safety.getSafetyLogs(eventName)
  }

  public getSafetyLogForEvent(
    eventName?: PropertyKey,
    opts?: { limit?: number; newestFirst?: boolean },
  ) {
    return this._safety.getSafetyLogForEvent(eventName, opts)
  }

  public getSafetyLogSize(eventName?: PropertyKey): number {
    return this._safety.getSafetyLogSize(eventName)
  }

  public getSafetyLogCapacity(): number {
    return this._safety.getSafetyLogCapacity()
  }

  public *getSafetyLogIterator(eventName?: PropertyKey) {
    yield* this._safety.getSafetyLogIterator(eventName)
  }

  public resetErrorCounts(eventName?: PropertyKey): void {
    this._safety.resetErrorCounts(eventName)
  }

  public clearSafetyLogs(eventName?: PropertyKey): void {
    this._safety.clearSafetyLogs(eventName)
  }

  public isSafetyEnabled(): boolean {
    return this._safety.isSafetyEnabled()
  }

  public setSafetyEnabled(enabled: boolean): void {
    this._safety.setSafetyEnabled(enabled)
  }
}

/** Normalize the event name to a concrete single value (take first if array). */
function normalizeEventName(eventName: readonly any[]): any {
  return Array.isArray(eventName) ? eventName[0] : eventName
}

/**
 * Compatibility subclass to preserve the historical export `SafetyEmitter`.
 *
 * Many places in the codebase (and tests) import and extend `SafetyEmitter`.
 * To avoid breaking changes we provide a tiny subclass here that simply
 * extends `SafeEmitter` so existing code that does `class X extends SafetyEmitter<EM>`
 * will continue to receive the emitter surface.
 */
// NOTE: the concrete safety bookkeeping implementation lives in
// `safety-emitter-3.ts` and is composed into `SafeEmitter` instances.

/**
 * Shared helper for emit() error handling with strict bubbling semantics.
 *
 * @template T
 * @param args The arguments array (payload or empty)
 * @param emitMethod Callback to perform the actual emission
 * @param onEmitError Callback to report errors
 */
async function emitWithErrorHandling<T>(
  args: T,
  emitMethod: (data: ExtractPayload<T> | undefined) => Promise<void>,
  onEmitError: (error: unknown) => void,
): Promise<void> {
  const data = (Array.isArray(args) && args.length > 0 ? args[0] : undefined) as ExtractPayload<T>
  try {
    await emitMethod(data)
  } catch (error) {
    if (error instanceof AggregateError) {
      for (const err of error.errors) onEmitError(err)
    } else {
      onEmitError(error)
    }
    throw error // always rethrow here
  } finally {
    // possible future hooks, e.g. metrics or cleanup
    void 0
  }
}

/**
 * Emit an internal event and forward errors to the global bus.
 *
 * @template EM extends Emittery<any>
 * @template K extends keyof InternalEventMap<any>
 * @param emitter Internal event bus
 * @param event Internal event name
 * @param payload Event payload
 * @param instance Optional SafeEmitter instance for diagnostics
 */
function fireAndForgetInternal<EM extends Emittery<any>, K extends keyof InternalEventMap<any>>(
  emitter: EM,
  event: K,
  payload: InternalEventMap<any>[K],
  instance?: SafeEmitter<any>,
) {
  void emitter.emit(event as any, payload).catch((err) => {
    // best-effort: forward to global
    SafeEmitter.report(INTERNAL_ON_EMIT_ERROR, [event, err, { emitter: instance }])
  })
  if (isInternalEvent(event)) {
    SafeEmitter.report(event, payload)
  }
}

/**
 * Create a cancelable once-wrapped promise that invokes the provided listener
 * and forwards `.off()` from the original promise when available.
 */
/**
 * Attach abort wiring to the original promise: if the provided signal aborts,
 * call `originalPromise.off()` (if present). Returns a cleanup function that
 * removes the attached listener.
 */
function wireAbortToPromise<T>(
  originalPromise: WrappedCancelable<T>,
  signal?: AbortSignal,
): (() => void) | undefined {
  if (!signal) return undefined
  if (signal.aborted) {
    try {
      originalPromise.off?.()
    } catch {
      void 0
    }
    return undefined
  }
  const onAbort = () => {
    try {
      originalPromise.off?.()
    } catch {
      void 0
    }
  }

  try {
    signal.addEventListener('abort', onAbort)
  } catch {
    void 0
  }
  return () => {
    try {
      signal.removeEventListener('abort', onAbort)
    } catch {
      void 0
    }
  }
}

/**
 * Await the original promise, invoke the listener and notify on listener errors.
 * Returns a promise that resolves to the original payload.
 */
function createListenerWrappedPromise<T>(
  originalPromise: WrappedCancelable<T>,
  listener: (data: T) => Awaitable,
  notifyListenerError: (error: unknown) => void,
): Promise<T> {
  return (async () => {
    const data = await originalPromise
    try {
      await listener(data)
    } catch (err) {
      notifyListenerError(err)
    }
    return data
  })()
}

/** Compose the small helpers into a single cancelable once promise. */
function createCancelableOnce<T>(
  originalPromise: WrappedCancelable<T>,
  listener: (data: T) => Awaitable, // listener invoked with payload
  options: { signal?: AbortSignal } | undefined,
  notifyListenerError: (error: unknown) => void,
): WrappedCancelable<T> {
  const cleanup = wireAbortToPromise(originalPromise, options?.signal)

  const wrapped = createListenerWrappedPromise(
    originalPromise,
    listener,
    notifyListenerError,
  ) as WrappedCancelable<T>

  attachOffForwarding(originalPromise, wrapped)

  // Ensure the abort listener is removed when the wrapped promise settles.
  wrapped.finally(() => {
    try {
      cleanup?.()
    } catch {
      void 0
    }
  })

  return wrapped
}

/**
 * Bind `.off` from the original promise onto the wrapped promise when available.
 */
function attachOffForwarding<T>(
  originalPromise: WrappedCancelable<T>,
  wrapped: WrappedCancelable<T>,
): void {
  if (typeof originalPromise.off === 'function') {
    try {
      wrapped.off = originalPromise.off.bind(originalPromise)
    } catch {
      void 0
    }
  }
}
