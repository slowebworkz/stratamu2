import { DEV_MODE } from '@/env'
import {
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_REMOVE_WARN,
  internalPublicBus,
  isInternalEvent,
  isPublicEvent,
} from '@/events'
import { MetricsTracker } from '@/performance'
import {
  addListenerMappingWeak,
  clearAllListenerMappingsWeak,
  emitWithErrorHandling,
  getWrappedListenerWeak,
  removeListenerMapping,
} from '@/utils'
import Emittery from 'emittery'
import { SafetyEmitter as SafetyManager } from './safety-emitter.ts'

import type {
  AllEvents,
  CancelablePromise,
  EventKey,
  InternalEventMap,
  ReadonlyEventMetrics,
  WrappedCancelable,
  PublicEventMap
} from '@/events'
import type { Awaitable, BaseEventMap } from '@repo/types'

export type DefaultInternalEventMap = InternalEventMap<Record<string, unknown[]>>

export abstract class SafeEmitter<EventMap extends BaseEventMap<unknown[]>> {
  /** Tracks all event names seen via on/once/off for complete metrics. */
  private readonly _seenEvents = new Set<keyof AllEvents<EventMap>>()
  /** Metrics tracker instance, enabled via event or method. */
  protected _metricsTracker?: MetricsTracker<AllEvents<EventMap>>

  private static readonly global = new Emittery<DefaultInternalEventMap>()

  public static report<K extends keyof DefaultInternalEventMap>(
    event: K,
    payload: DefaultInternalEventMap[K],
  ) {
    return SafeEmitter.global.emit(event, payload)
  }

  public static onGlobal<K extends keyof DefaultInternalEventMap>(
    event: K,
    listener: (payload: DefaultInternalEventMap[K]) => Awaitable,
  ) {
    return SafeEmitter.global.on(event, listener)
  }

  protected readonly _public: Emittery<AllEvents<EventMap>> = new Emittery<AllEvents<EventMap>>()

  private readonly _safety: SafetyManager<EventMap>

  protected get _safetyManager(): SafetyManager<EventMap> {
    return this._safety
  }

  protected emitInternal<K extends keyof InternalEventMap<any>>(
    key: K,
    payload: InternalEventMap<any>[K],
  ): void {
    fireAndForgetInternal(this._public, key, payload, this)
  }

  private readonly _listenerMaps = new Map<
    keyof AllEvents<EventMap>,
    WeakMap<(data: any) => Awaitable, (data: any) => Awaitable>
  >()

  constructor() {
    // Compose the safety manager with hardcoded presets (no user config)
    // Compose the safety manager with hardcoded presets (no user config)
    const safetyManagerBus = new Emittery<PublicEventMap<EventMap>>();

    this._safety = new SafetyManager<EventMap>(safetyManagerBus, {
      sanitizeErrors: true,
      safetyLogCap: 100
    })

    this._public.once('enableMetrics', (_eventData) => {
      if (!this._metricsTracker) {
        this._metricsTracker = new MetricsTracker<AllEvents<EventMap>>(this._public)
      }
      return true
    })
  }

  public removeAllListeners(): void {
    // Clear the public bus
    this._public.clearListeners()

    // Use utility to clear all listener mappings
    clearAllListenerMappingsWeak(this._listenerMaps)

    // Clear all safety logs and error counts
    this._safety.reset()

    // Optionally, notify that all listeners were removed (internal event)
    this.emitInternal(INTERNAL_ON_LISTENER_REMOVED, [
      null, // no specific event
      null, // no specific listener
      { emitter: this },
    ] as any)
  }

  protected recordListenerError(eventName: string, error: unknown, listenerName: string): void {
    this._safety.recordListenerErrorFor(eventName, error, listenerName)
  }

  protected get _errorCounts(): Record<string, number> {
    const m = this._safety.getAllErrorCounts()
    const out: Record<string, number> = {}
    for (const [k, v] of m) out[String(k)] = v
    return out
  }

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

  protected get _safetyEnabled(): boolean {
    return this._safety.isSafetyEnabled()
  }

  protected set _safetyEnabled(enabled: boolean) {
    this._safety.setSafetyEnabled(enabled)
  }

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

    for (const k of this._seenEvents) {
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
    for (const k of errorCountsMap.keys()) {
      logSizes[String(k) as EventKey<EventMap>] = this._safety.getSafetyLogSize(String(k))
    }
    logSizes.__total = this._safety.getSafetyLogSize()

    return {
      listenerCounts,
      safety: {
        errorCounts,
        logSizes,
        capacity: this._safety.getSafetyLogCapacity(),
        enabled: this._safety.isSafetyEnabled(),
      },
    } as ReadonlyEventMetrics<EventMap>
  }

  public on<K extends keyof AllEvents<EventMap>>(
    event: K | readonly K[],
    listener: (data: AllEvents<EventMap>[K]) => Awaitable,
    options?: { signal?: AbortSignal },
  ) {
    // Support subscribing to multiple events (array form) while keeping
    // our listener-mapping bookkeeping per-event so `off(original)` works.
    const events: readonly K[] = Array.isArray(event) ? event : [event]

    for (const e of events) {
      this._seenEvents.add(e)
      const safeListenerForE = async (data: AllEvents<EventMap>[typeof e]) => {
        try {
          await listener(data)
        } catch (error) {
          this.onListenerError(e, error, { type: 'on', listener, emitter: this })
        }
      }
      addListenerMappingWeak(this._listenerMaps, e, listener, safeListenerForE)
      this._public.on(e, safeListenerForE, options)
    }

    // Optionally, return a disposable or similar if needed
  }

  public once<K extends keyof AllEvents<EventMap>>(
    event: K,
    listener: (data: AllEvents<EventMap>[K]) => Awaitable,
    options?: { signal?: AbortSignal },
  ): CancelablePromise<AllEvents<EventMap>[K]> {
    this._seenEvents.add(event)
    const originalPromise = this._public.once(event) as WrappedCancelable<AllEvents<EventMap>[K]>

    const notify = (error: unknown) =>
      this.onListenerError(event, error, { type: 'once', listener, emitter: this })

    // Explicitly specify the generic for correct inference
    return createCancelableOnce<AllEvents<EventMap>[K]>(
      originalPromise,
      listener as any,
      options,
      notify,
    )
  }

  public off<K extends keyof AllEvents<EventMap>>(
    event: K,
    listener: (data: AllEvents<EventMap>[K]) => Awaitable,
  ) {
    this._seenEvents.add(event)
    const safeListener = getWrappedListenerWeak(this._listenerMaps, event, listener)
    if (safeListener) {
      removeListenerMapping(this._listenerMaps, event, listener)
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

  public async emit<K extends keyof AllEvents<EventMap>>(
    event: K,
    ...args: AllEvents<EventMap>[K] extends undefined ? [] : [AllEvents<EventMap>[K]]
  ): Promise<void> {
    const promises = emitWithErrorHandling(args, (data) =>
      this._public.emitSerial(event, data as AllEvents<EventMap>[K]),
    )
    await Promise.allSettled(promises)
  }

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

      this.emitInternal(INTERNAL_ON_LISTENER_ERROR, [
        eventName,
        error,
        context,
      ] as AllEvents<EventMap>[typeof INTERNAL_ON_LISTENER_ERROR])
    } else {
      if (DEV_MODE) {
        console.error('[SafeEmitter] Internal event listener error:', { eventName, error, context })
      }
    }
  }

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

      this.emitInternal(INTERNAL_ON_EMIT_ERROR, [
        eventName,
        error,
        { ...(context || {}), emitter: this },
      ] as AllEvents<EventMap>[typeof INTERNAL_ON_EMIT_ERROR])
    }
  }

  protected recordListenerErrorFor(
    eventName: PropertyKey,
    error: unknown,
    listenerName?: string,
  ): void {
    // Delegate to internal safety emitter if present. Subclasses may override
    this._safety?.recordListenerErrorFor(eventName, error, listenerName)
  }
}

/**
 * Compatibility subclass to preserve historical export `SafetyEmitter`.
 *
 * Many places in the codebase (and tests) import and extend `SafetyEmitter`.
 * To avoid breaking changes we provide a tiny subclass here that simply
 * extends `SafeEmitter` so existing code that does `class X extends SafetyEmitter<EM>`
 * will continue to receive the emitter surface.
 */
export class SafetyEmitter<
  EventMap extends BaseEventMap<unknown[]>,
> extends SafeEmitter<EventMap> { }

/**
 * Shared helper for emit() error handling with strict bubbling semantics.
 *
 * @template T
 * @param args The arguments array (payload or empty)
 * @param emitMethod Callback to perform the actual emission
 * @param onEmitError Callback to report errors
 */

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
export function fireAndForgetInternal<
  EM extends Emittery<any>,
  K extends keyof InternalEventMap<any>,
>(emitter: EM, event: K, payload: InternalEventMap<any>[K], instance?: SafeEmitter<any>) {
  void emitter.emit(event as any, payload).catch((err) => {
    // best-effort: forward to global
    SafeEmitter.report(INTERNAL_ON_EMIT_ERROR as any, [event, err, { emitter: instance }])
  })
  if (isInternalEvent(event as PropertyKey)) {
    void SafeEmitter.report(event as any, payload).catch(() => { })
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

// Example: Combine user events and control events for SafeEmitter
// type MyEventMap = BaseEventMap<unknown[]> & ControlEvents;
// const emitter = new SafeEmitter<MyEventMap>()
// const tracker = new MetricsTracker<MyEventMap>(emitter)
