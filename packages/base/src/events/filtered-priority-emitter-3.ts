import { LinkedList } from '@/data'
import { LoggedEmitter } from './logged-emitter-3.js'

import type { Args, BaseEventMap } from '@repo/types'
import type { UnsubscribeFunction } from 'emittery'
import type {
  ListenerCallback,
  Priority,
  PriorityListener,
  PriorityListenerOptions,
} from './types.js'

/**
 * FilteredPriorityEmitter: priority + filter listeners + one-time support.
 * See other variants for documentation; this file mirrors that behavior.
 */
export abstract class FilteredPriorityEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends LoggedEmitter<EventMap> {
  private _priorityListeners: {
    [EventName in keyof EventMap]?: LinkedList<PriorityListener<EventMap, EventName>>
  } = {}

  private _sequenceCounter = 0

  onWithOptions<EventName extends keyof EventMap>(
    event: EventName,
    callback: ListenerCallback<EventMap, EventName>,
    options?: PriorityListenerOptions<EventMap, EventName>,
  ): UnsubscribeFunction {
    const list =
      this._priorityListeners[event] ??
      (this._priorityListeners[event] = new LinkedList<PriorityListener<EventMap, EventName>>(
        (a: PriorityListener<EventMap, EventName>, b: PriorityListener<EventMap, EventName>) => {
          const priorityDiff = b.priority - a.priority
          return priorityDiff !== 0 ? priorityDiff : a.sequence - b.sequence
        },
      ))

    const listener: PriorityListener<EventMap, EventName> = {
      callback,
      priority: (options?.priority ?? 0) as Priority,
      filter: options?.filter,
      sequence: this._sequenceCounter++,
    }

    list.sortedInsert(listener)
    this._priorityListeners[event] = list

    return () => {
      list.remove(listener)
    }
  }

  onceWithOptions<EventName extends keyof EventMap>(
    event: EventName,
    callback: ListenerCallback<EventMap, EventName>,
    options?: PriorityListenerOptions<EventMap, EventName>,
  ): UnsubscribeFunction {
    let called = false
    const unsubscribe = this.onWithOptions(
      event,
      async (...args) => {
        if (!called) {
          called = true
          unsubscribe()
          await callback(...args)
        }
      },
      options,
    )
    return unsubscribe
  }

  async emitWithPriority<EventName extends keyof EventMap>(
    event: EventName,
    ...args: Args<EventMap[EventName]>
  ): Promise<void> {
    const list = this._priorityListeners[event]
    const errors: unknown[] = []
    if (list && Symbol.iterator in list) {
      for (const listener of list) {
        try {
          let shouldExecute = true
          if (listener.filter) shouldExecute = listener.filter(...(args as any))
          if (shouldExecute) await listener.callback(...(args as any))
        } catch (err) {
          errors.push(err)
          // record into SafeEmitter bookkeeping if available
          try {
            ;(this as any).recordListenerErrorFor?.(
              event as any,
              err,
              listener.callback?.name ?? 'anonymous',
            )
          } catch {
            // best-effort: ignore errors from optional bookkeeping
            void 0
          }
        }
      }
    }
    if (errors.length) {
      // Emit aggregated errors — cast to any to satisfy type constraints on the base emit signature.
      await (super.emit as any)('error', errors)
    }
    await (super.emit as any)(event, ...args)
  }

  clearPriorityListeners<EventName extends keyof EventMap>(event?: EventName): void {
    if (event) {
      this._priorityListeners[event]?.clear()
    } else {
      for (const key in this._priorityListeners) {
        this._priorityListeners[key as keyof EventMap]?.clear()
      }
    }
  }

  listenerCount<Name extends keyof EventMap>(eventName?: Name | readonly Name[]): number {
    if (eventName === undefined) {
      let priorityCount = 0
      for (const list of Object.values(this._priorityListeners)) priorityCount += list?.size ?? 0
      return priorityCount + super.listenerCount()
    }
    if (Array.isArray(eventName)) {
      let priorityCount = 0
      for (const name of eventName) {
        const singleName = name as Name
        priorityCount += this._priorityListeners[singleName]?.size ?? 0
      }
      return priorityCount + super.listenerCount(eventName as readonly Name[])
    }
    const singleEventName = eventName as Name
    const priorityCount = this._priorityListeners[singleEventName]?.size ?? 0
    return priorityCount + super.listenerCount(singleEventName)
  }
}
