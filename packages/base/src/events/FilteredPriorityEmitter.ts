import Emittery from "emittery";
import type { Args, BaseEventMap } from "@repo/types";

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
  EventMap extends BaseEventMap = BaseEventMap<unknown>
> extends Emittery<EventMap> {
  /**
   * Internal map of event names to arrays of priority listeners.
   */
  private _priorityListeners: {
    [EventName in keyof EventMap]?: Array<{
      callback: (...args: Args<EventMap[EventName]>) => void | Promise<void>
      priority: number
      filter?: (...args: Args<EventMap[EventName]>) => boolean
    }>
  } = {}

  /**
   * Register a listener with optional priority and filter.
   * Returns an unsubscribe function.
   *
   * @param event The event name.
   * @param callback The listener function.
   * @param options Optional: { priority, filter }.
   * @returns Unsubscribe function.
   */
  onWithOptions<EventName extends keyof EventMap>(
    event: EventName,
    callback: (...args: Args<EventMap[EventName]>) => void | Promise<void>,
    options?: {
      priority?: number
      filter?: (...args: Args<EventMap[EventName]>) => boolean
    }
  ): () => void {
    const arr = this._priorityListeners[event] ?? []
    const listener = {
      callback,
      priority: options?.priority ?? 0,
      filter: options?.filter
    }
    arr.push(listener)
    arr.sort((a, b) => b.priority - a.priority)
    this._priorityListeners[event] = arr
    return () => {
      this._priorityListeners[event] = (
        this._priorityListeners[event] || []
      ).filter((l) => l !== listener)
    }
  }

  /**
   * Emit an event, calling priority listeners first (in order, with filters), then Emittery listeners.
   * Returns a Promise that resolves when all listeners have completed.
   *
   * @param event The event name.
   * @param args Arguments for the event.
   */
  async emitWithPriority<EventName extends keyof EventMap>(
    event: EventName,
    ...args: Args<EventMap[EventName]>
  ): Promise<void> {
    const arr = this._priorityListeners[event] ?? []
    for (const listener of arr) {
      if (!listener.filter || listener.filter(...args)) {
        await listener.callback(...args)
      }
    }
    await super.emit(event, ...(args as [any]))
  }

  /**
   * Remove all priority listeners for all events.
   */
  clearPriorityListeners(): void {
    this._priorityListeners = {}
  }
}
