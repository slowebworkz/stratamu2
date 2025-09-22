import type { Args, BaseEventMap } from '@repo/types'
import Emittery from 'emittery'
import { LinkedList } from '../data/index.ts'

type PriorityListener<
  EventMap,
  EventName extends keyof EventMap,
  EventArgs extends Args<EventMap[EventName]> = Args<EventMap[EventName]>,
> = {
  callback: (...args: EventArgs) => void | Promise<void>
  priority: number
  filter?: (...args: EventArgs) => boolean
}

/**
 * FilteredPriorityEmitter extends Emittery to support advanced listener options:
 *
 * - Priority listeners: Listeners can be registered with a priority (higher runs first).
 * - Filtered listeners: Listeners can be registered with a filter function to conditionally run.
 * - onWithOptions: Register a listener with priority and/or filter.
 * - emitWithPriority: Emits to priority listeners (in order, with filters), then to normal listeners.
 * - clearPriorityListeners: Remove all priority listeners.
 *
 * @template EventMap - The event map for this emitter.
 */
export class FilteredPriorityEmitter<
  /**
   * Returns the total number of listeners for a given event (priority + Emittery listeners).
   * @param event The event name.
   */
  EventMap extends BaseEventMap = BaseEventMap<unknown>,
> extends Emittery<EventMap> {
  // --- Private Fields ---
  /** Internal map of event names to arrays of priority listeners. */
  private _priorityListeners: {
    [EventName in keyof EventMap]?: LinkedList<PriorityListener<EventMap, EventName>>
  } = {}

  // // --- Public API ---
  // /**
  //  * Register a one-time listener with optional priority and filter.
  //  * Returns an unsubscribe function.
  //  */
  // onceWithOptions<EventName extends keyof EventMap>(
  //   event: EventName,
  //   callback: (...args: Args<EventMap[EventName]>) => void | Promise<void>,
  //   options?: { priority?: number; filter?: (...args: Args<EventMap[EventName]>) => boolean }
  // ): () => void {
  //   const unsubscribe = this.onWithOptions(event, async (...args) => {
  //     unsubscribe()
  //     await callback(...args)
  //   }, options)
  //   return unsubscribe
  // }

  /**
   * Register a listener with optional priority and filter.
   * Returns an unsubscribe function.
   */
  onWithOptions<EventName extends keyof EventMap>(
    event: EventName,
    callback: (...args: Args<EventMap[EventName]>) => void | Promise<void>,
    options?: {
      priority?: number
      filter?: (...args: Args<EventMap[EventName]>) => boolean
    },
  ): () => void {
    const list =
      this._priorityListeners[event] ??
      (this._priorityListeners[event] = new LinkedList<PriorityListener<EventMap, EventName>>(
        (a, b) => b.priority - a.priority,
      ))
    const listener = {
      callback,
      priority: options?.priority ?? 0,
      filter: options?.filter,
    }

    list.sortedInsert(listener)

    this._priorityListeners[event] = list

    return () => {
      list.remove(listener)
    }
  }

  /**
   * Register a one-time listener with optional priority and filter.
   * Returns an unsubscribe function.
   */
  onceWithOptions<EventName extends keyof EventMap>(
    event: EventName,
    callback: (...args: Args<EventMap[EventName]>) => void | Promise<void>,
    options?: {
      priority?: number
      filter?: (...args: Args<EventMap[EventName]>) => boolean
    },
  ): () => void {
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

  /**
   * Emit an event, calling priority listeners first (in order, with filters), then Emittery listeners.
   * Returns a Promise that resolves when all listeners have completed.
   */
  async emitWithPriority<EventName extends keyof EventMap>(
    event: EventName,
    ...args: Args<EventMap[EventName]>
  ): Promise<void> {
    const list = this._priorityListeners[event]
    const errors: unknown[] = []
    if (list) {
      for (const listener of list) {
        if (!listener.filter || listener.filter(...args)) {
          try {
            await listener.callback(...args)
          } catch (err) {
            errors.push(err)
          }
        }
      }
    }
    if (errors.length) {
      await super.emit('error', errors as any)
    }
    await super.emit(event, ...(args as [any]))
  }

  /**
   * Remove all priority listeners for all events, or for a specific event.
   */
  clearPriorityListeners<EventName extends keyof EventMap>(event?: EventName): void {
    if (event) {
      this._priorityListeners[event]?.clear()
    } else {
      for (const key in this._priorityListeners) {
        this._priorityListeners[key as keyof EventMap]?.clear()
      }
    }
  }

  /**
   * Returns the total number of listeners for a given event (priority + Emittery listeners).
   */
  listenerCount<Name extends keyof EventMap>(eventName?: Name | readonly Name[]): number {
    if (eventName === undefined) {
      // Count all listeners for all events
      let priorityCount = 0
      for (const list of Object.values(this._priorityListeners)) {
        priorityCount += list?.size ?? 0
      }
      return priorityCount + super.listenerCount()
    }
    if (Array.isArray(eventName)) {
      let priorityCount = 0
      for (const name of eventName) {
        priorityCount += this._priorityListeners[name]?.size ?? 0
      }
      return priorityCount + super.listenerCount(eventName)
    }
    const priorityCount = this._priorityListeners[eventName]?.size ?? 0
    return priorityCount + super.listenerCount(eventName)
  }
}
