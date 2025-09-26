import type { Args, BaseEventMap } from '@repo/types'
import type { UnsubscribeFunction } from 'emittery'
import Emittery from 'emittery'
import type { Promisable } from 'type-fest'
import type { InternalEventMap } from './index.js'
import { INTERNAL_ON_EMIT_ERROR, INTERNAL_ON_LISTENER_ERROR } from './index.js'
import type { EmitteryOncePromise, ListenerErrorLogEntry, SafeEmitterEventMap } from './types.js'

// Internal event map for error events only

// ===================================
// SafeEmitter Class
// ===================================

export abstract class SafeEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends Emittery<SafeEmitterEventMap<EventMap>> {
  // ----------- Public Methods -----------

  /** Subscribe to events. */
  public on<Name extends keyof SafeEmitterEventMap<EventMap, true>>(
    eventName: Name | readonly Name[],
    listener: (eventData: SafeEmitterEventMap<EventMap, true>[Name]) => void | Promise<void>,
    options?: { signal?: AbortSignal },
  ): UnsubscribeFunction {
    const safeListener = async (eventData: SafeEmitterEventMap<EventMap, true>[Name]) => {
      try {
        await listener(eventData)
      } catch (error) {
        const actualEventName = normalizeEventName(eventName)
        this.onListenerError(actualEventName as keyof EventMap, error, {
          type: 'on',
          listener,
        })
      }
    }
    return super.on(eventName, safeListener, options)
  }

  /** Subscribe to a single event occurrence. */
  public once<Name extends keyof SafeEmitterEventMap<EventMap, true>>(
    eventName: Name,
    filter?: (eventData: SafeEmitterEventMap<EventMap, true>[Name]) => boolean,
  ): EmitteryOncePromise<SafeEmitterEventMap<EventMap, true>[Name]> {
    const originalPromise = super.once(eventName, filter)
    const wrappedPromise = originalPromise.catch((error) => {
      this.onListenerError(eventName as keyof EventMap, error, {
        type: 'once',
        hasFilter: !!filter,
      })
      throw error
    }) as unknown as EmitteryOncePromise<SafeEmitterEventMap<EventMap, true>[Name]>
    wrappedPromise.off = originalPromise.off.bind(originalPromise)
    return wrappedPromise
  }

  /** Emit an event. */
  public async emit<Name extends keyof SafeEmitterEventMap<EventMap>>(
    eventName: Name,
    eventData?: SafeEmitterEventMap<EventMap>[Name],
  ): Promise<void> {
    try {
      if (eventData === undefined) {
        await super.emit(eventName as any)
      } else {
        await super.emit(eventName as any, eventData as any)
      }
    } catch (err) {
      this.onEmitError(eventName, err)
    }
  }

  /** Emit an event with tuple payload forwarding. */
  public async emitSafe<Name extends keyof SafeEmitterEventMap<EventMap>>(
    eventName: Name,
    ...args: Args<SafeEmitterEventMap<EventMap>[Name]>
  ): Promise<void> {
    return this.emit(eventName, ...(args as any))
  }

  // ----------- Protected Members & Methods -----------

  protected _errorCounts: Record<string, number> = {}
  protected _safetyLogs: Record<string, ListenerErrorLogEntry[]> = {}

  /** Track listener errors. */
  protected recordListenerError(eventName: string, error: unknown, listener: string): void {
    this._errorCounts = {
      ...this._errorCounts,
      [eventName]: (this._errorCounts[eventName] || 0) + 1,
    }
    this._safetyLogs = {
      ...this._safetyLogs,
      [eventName]: [
        ...(this._safetyLogs[eventName] || []),
        { timestamp: Date.now(), error, listener },
      ],
    }
  }

  /** Handle listener errors. */
  protected onListenerError<Name extends keyof EventMap>(
    eventName: Name,
    error: unknown,
    context: {
      type: 'on' | 'once'
      listener?: (...args: any[]) => Promisable<void>
      hasFilter?: boolean
    },
  ): void {
    this.emit(
      INTERNAL_ON_LISTENER_ERROR as keyof InternalEventMap<EventMap>,
      [eventName as keyof EventMap, error, context] as any,
    )
  }

  /** Handle emit errors. */
  protected onEmitError<Name extends keyof EventMap>(eventName: Name, error: unknown): void {
    this.emit(
      INTERNAL_ON_EMIT_ERROR as keyof InternalEventMap<EventMap>,
      [eventName as keyof EventMap, error] as any,
    )
  }

  // ----------- Private Members -----------

  private _safetyEnabled = true
}

// ===================================
// Helpers (outside the class)
// ===================================

/** Normalize the event name to a single key (take first if array). */
function normalizeEventName<Name>(eventName: Name | readonly Name[]): Name {
  return (Array.isArray(eventName) ? eventName[0] : eventName) as Name
}
