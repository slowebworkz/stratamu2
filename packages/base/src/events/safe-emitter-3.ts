import type { Awaitable, BaseEventMap } from '@repo/types'
import Emittery from 'emittery'
import type { AllEvents, ExtractPayload } from './events-types.js'
import { internalPublicBus } from './events-types.js'
import {
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_REMOVE_WARN,
  InternalEventMap,
  isInternalEvent,
  isPublicEvent,
} from './private-events.js'
import { SafetyEmitter as SafetyManager, type SafetyEmitterOptions } from './safety-emitter.js'

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
  constructor(opts?: SafetyEmitterOptions<EventMap>) {
    // Preset defaults applied when callers do not provide explicit options.
    // We enable error sanitization by default to avoid retaining large
    // object graphs in the safety logs, and expose a reasonable default
    // capacity for per-event safety buffers.
    const preset: SafetyEmitterOptions<EventMap> = {
      sanitizeErrors: true,
      safetyLogCap: 100,
    }
    const finalOpts = { ...preset, ...(opts ?? {}) }
    this._safety = new SafetyManager<EventMap>(internalPublicBus<EventMap>(this), finalOpts)
  }

  public on<K extends keyof AllEvents<EventMap>>(
    event: K,
    listener: (data: AllEvents<EventMap>[K]) => Awaitable,
  ) {
    let map = this._listenerMaps.get(event)
    if (!map) {
      map = new WeakMap()
      this._listenerMaps.set(event, map)
    }
    const safeListener = async (data: AllEvents<EventMap>[K]) => {
      try {
        await listener(data)
      } catch (error) {
        this.onListenerError(event, error, { type: 'on', listener, emitter: this })
      }
    }
    map.set(listener, safeListener)
    return this._public.on(event, safeListener)
  }

  /**
   * Register a one-time listener for an event.
   * @template K
   * @param event Event name
   * @param listener Listener function
   * @returns Promise resolving to event payload
   */
  public async once<K extends keyof AllEvents<EventMap>>(
    event: K,
    listener: (data: AllEvents<EventMap>[K]) => Awaitable,
  ): Promise<AllEvents<EventMap>[K]> {
    const data = await this._public.once(event)
    try {
      await listener(data)
    } catch (error) {
      this.onListenerError(event, error, { type: 'once', listener, emitter: this })
    }
    return data
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
      } catch (err) {
        // ignore errors in bookkeeping
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
      } catch { }

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

  public getSafetyLogForEvent(eventName?: PropertyKey, opts?: { limit?: number; newestFirst?: boolean }) {
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


