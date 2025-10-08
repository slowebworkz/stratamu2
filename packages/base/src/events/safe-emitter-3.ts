import type { Awaitable, BaseEventMap } from '@repo/types'
import Emittery from 'emittery'
import {
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_REMOVE_WARN,
  InternalEventMap,
  isInternalEvent,
  isPublicEvent,
} from './private-events.js'

/**
 * Combines user event map and internal event map for type-safe event handling.
 *
 * @template EventMap extends BaseEventMap<unknown[]>
 */
type AllEvents<EventMap extends BaseEventMap<unknown[]>> = EventMap & InternalEventMap<EventMap>

/**
 * Shared helper for emit() error handling with strict bubbling semantics.
 *
 * @param args The arguments array (payload or empty)
 * @param emitMethod Callback to perform the actual emission
 * @param onEmitError Callback to report errors
 */

/**
 * Utility type to extract the payload type from a tuple.
 *
 * @template T extends any[]
 */
type ExtractPayload<T> = T extends [infer U] ? U : never

/**
 * Indicates if the environment is development (not production).
 */
const DEV_MODE = (process?.env?.NODE_ENV ?? 'development') !== 'production'

/**
 * Type-safe event emitter with internal diagnostics and error handling.
 *
 * @template EventMap extends BaseEventMap<unknown[]>
 */
export class SafeEmitter<EventMap extends BaseEventMap<unknown[]>> {
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
   * @private
   */
  private readonly _public = new Emittery<AllEvents<EventMap>>()

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
}

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
