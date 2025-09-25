import { MetricsEmitter } from './metrics-emitter.js'

import type { Args, BaseEventMap } from '@repo/types'
import type { OmnipresentEventData, UnsubscribeFunction } from 'emittery'
import type { EmitteryOncePromise, MetricsEmitterEvents } from './types.js'

/**
 * Event emitter with safe emission that prevents system crashes from listener errors.
 *
 * Wraps all emits in try/catch and routes errors to customizable handler.
 * Useful for game engines or servers where single listener errors shouldn't crash the process.
 *
 * @template EventMap - The event map for this emitter
 */
export abstract class SafeEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends MetricsEmitter<EventMap> {
  // =============================================================================
  // Public Methods
  // =============================================================================

  /**
   * Add listener with individual error wrapping for isolation.
   *
   * @param eventName The event name or array of names
   * @param listener The listener function
   * @param options Optional signal for abortable listeners
   * @returns Unsubscribe function
   */
  on<EventName extends keyof (EventMap & MetricsEmitterEvents) | keyof OmnipresentEventData>(
    eventName: EventName | readonly EventName[],
    listener: (
      eventData: (EventMap & MetricsEmitterEvents & OmnipresentEventData)[EventName],
    ) => void | Promise<void>,
    options?: { signal?: AbortSignal },
  ): UnsubscribeFunction {
    const safeListener = async (
      eventData: (EventMap & MetricsEmitterEvents & OmnipresentEventData)[EventName],
    ) => {
      try {
        await listener(eventData)
      } catch (error) {
        // Get the actual event name for error reporting
        const actualEventName = Array.isArray(eventName) ? eventName[0] : eventName
        this.onListenerError(actualEventName as keyof EventMap, error, {
          type: 'on',
          listener,
        })
      }
    }
    return super.on(eventName, safeListener, options)
  }

  /**
   * Add one-time listener with error isolation.
   * Returns EmitteryOncePromise with error handling built in.
   *
   * @param eventName The event name
   * @param filter Optional filter predicate
   * @returns Promise-like object with .off() method for cancellation
   */
  once<EventName extends keyof (EventMap & MetricsEmitterEvents) | keyof OmnipresentEventData>(
    eventName: EventName,
    filter?: (
      eventData: (EventMap & MetricsEmitterEvents & OmnipresentEventData)[EventName],
    ) => boolean,
  ): EmitteryOncePromise<(EventMap & MetricsEmitterEvents & OmnipresentEventData)[EventName]> {
    const originalPromise = super.once(eventName, filter)

    // Create a wrapped promise that preserves .off() method and adds error handling
    const wrappedPromise = originalPromise.catch((error) => {
      this.onListenerError(eventName as keyof EventMap, error, {
        type: 'once',
        hasFilter: !!filter,
      })
      // Re-throw to maintain promise chain behavior
      throw error
    }) as EmitteryOncePromise<(EventMap & MetricsEmitterEvents & OmnipresentEventData)[EventName]>

    // Preserve the .off() method for cancellation
    wrappedPromise.off = originalPromise.off.bind(originalPromise)

    return wrappedPromise
  }

  /**
   * Emit an event safely with error handling.
   *
   * @param eventName The event name
   * @param args Arguments for the event
   */
  async emitSafe<EventName extends keyof EventMap>(
    eventName: EventName,
    ...args: Args<EventMap[EventName]>
  ): Promise<void> {
    try {
      if (args.length === 0) {
        await super.emit(eventName as any)
      } else {
        // Handle multiple arguments by passing them through
        await (super.emit as any)(eventName, ...args)
      }
    } catch (err) {
      this.onEmitError(eventName, err)
    }
  }

  // =============================================================================
  // Protected Methods
  // =============================================================================

  /**
   * Error handler for listener failures.
   *
   * @param eventName The event name
   * @param error The error thrown by the listener
   * @param context Context about the listener that failed
   */
  protected onListenerError<EventName extends keyof EventMap>(
    eventName: EventName,
    error: unknown,
    context: {
      type: 'on' | 'once'
      listener?: (...args: any[]) => void | Promise<void>
      hasFilter?: boolean
    },
  ): void {
    this.log.error(
      {
        event: String(eventName),
        listenerType: context.type,
        listenerName: context.listener?.name || '<anonymous>',
        hasFilter: context.hasFilter,
        error,
      },
      `SafeEmitter caught ${context.type} listener error`,
    )
  }

  /**
   * Error handler for emit failures. Can be overridden in subclasses.
   *
   * @param eventName The event name
   * @param error The error thrown by a listener
   */
  protected onEmitError<EventName extends keyof EventMap>(
    eventName: EventName,
    error: unknown,
  ): void {
    this.log.error({ event: String(eventName), error }, 'SafeEmitter caught an error during emit')
  }
}
