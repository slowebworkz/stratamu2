import { LinkedList } from '@/data'
import { LoggedEmitter } from './logged-emitter.js'

import type { Args, BaseEventMap } from '@repo/types'
import type { UnsubscribeFunction } from 'emittery'
import type {
  ListenerCallback,
  Priority,
  PriorityListener,
  PriorityListenerOptions,
} from './types.js'

/**
 * Abstract event emitter with priority and filtering capabilities.
 *
 * ## Features:
 * - **Priority listeners**: Higher priority numbers execute first
 * - **Filtered listeners**: Use filter functions to conditionally execute listeners
 * - **One-time listeners**: Support for `once` semantics with priority/filter options
 * - **Error handling**: Catches errors from priority listeners and emits them as 'error' events
 * - **Structured logging**: Inherits pino logging from LoggedEmitter
 *
 * ## Usage Example:
 * ```typescript
 * // High priority logger
 * emitter.onWithOptions('message', (msg) => console.log(msg), {
 *   priority: 10
 * })
 *
 * // Conditional handler
 * emitter.onWithOptions('message', (msg) => saveToFile(msg), {
 *   filter: (msg) => msg.important === true
 * })
 * ```
 *
 * @template EventMap - The event map defining event names and their data types
 */
export abstract class FilteredPriorityEmitter<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
> extends LoggedEmitter<EventMap> {
  /**
   * Internal storage for priority listeners, organized by event name.
   * Uses LinkedList for efficient sorted insertion based on priority.
   */
  private _priorityListeners: {
    [EventName in keyof EventMap]?: LinkedList<PriorityListener<EventMap, EventName>>
  } = {}

  /**
   * Sequence counter for maintaining insertion order within same priority level.
   */
  private _sequenceCounter = 0

  /**
   * Register a listener with optional priority and filter capabilities.
   *
   * @param event - The event name to listen for
   * @param callback - The function to call when the event is emitted
   * @param options - Optional configuration object
   * @param options.priority - Priority level (default: 0). Higher numbers execute first
   * @param options.filter - Optional filter function. Return true to execute, false to skip
   * @returns Unsubscribe function to remove this listener
   *
   * @example
   * ```typescript
   * // High priority listener
   * const unsubscribe = emitter.onWithOptions('data', (data) => {
   *   console.log('Priority handler:', data)
   * }, { priority: 10 })
   *
   * // Conditional listener
   * emitter.onWithOptions('data', (data) => {
   *   processImportantData(data)
   * }, {
   *   filter: (data) => data.important === true
   * })
   *
   * // Later: remove the listener
   * unsubscribe()
   * ```
   */
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
          // If same priority, use sequence for insertion order (lower sequence = earlier insertion)
          return priorityDiff !== 0 ? priorityDiff : a.sequence - b.sequence
        },
      ))
    const listener = {
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

  /**
   * Register a one-time listener that automatically unsubscribes after first execution.
   * Supports priority and filter options like `onWithOptions`.
   *
   * @param event - The event name to listen for
   * @param callback - The function to call when the event is emitted (only once)
   * @param options - Optional configuration object
   * @param options.priority - Priority level (default: 0). Higher numbers execute first
   * @param options.filter - Optional filter function. Return true to execute, false to skip
   * @returns Unsubscribe function to remove this listener before it fires
   *
   * @example
   * ```typescript
   * // Wait for first important message with high priority
   * emitter.onceWithOptions('message', (msg) => {
   *   console.log('First important message:', msg)
   * }, {
   *   priority: 5,
   *   filter: (msg) => msg.important === true
   * })
   * ```
   */
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

  /**
   * Emit an event with priority listener support.
   *
   * ## Execution Order:
   * 1. Priority listeners (highest priority first)
   * 2. Filter functions are evaluated for each listener
   * 3. Standard Emittery listeners (if any)
   *
   * ## Error Handling:
   * - Errors from priority listeners are caught and emitted as 'error' events
   * - Execution continues even if some listeners throw errors
   * - Standard Emittery error handling applies to regular listeners
   *
   * @param event - The event name to emit
   * @param args - Arguments to pass to listeners
   * @returns Promise that resolves when all listeners complete
   *
   * @example
   * ```typescript
   * await emitter.emitWithPriority('data', {
   *   message: 'Hello',
   *   timestamp: Date.now()
   * })
   * ```
   */
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
          if (listener.filter) {
            shouldExecute = listener.filter(...args)
          }
          if (shouldExecute) {
            await listener.callback(...args)
          }
        } catch (err) {
          errors.push(err)
        }
      }
    }
    if (errors.length) {
      await super.emit('error', errors as any)
    }
    // Handle the Args type union by applying the arguments directly
    await (super.emit as any)(event, ...args)
  }

  /**
   * Remove priority listeners from the emitter.
   *
   * **Important**: This only affects priority listeners registered via `onWithOptions`
   * or `onceWithOptions`. Regular Emittery listeners are not affected.
   *
   * @param event - Optional event name to target. If omitted, clears ALL priority listeners
   *
   * @example
   * ```typescript
   * // Clear listeners for a specific event
   * emitter.clearPriorityListeners('data')
   *
   * // Clear all priority listeners
   * emitter.clearPriorityListeners()
   * ```
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
   * Count the total number of listeners for events.
   *
   * Returns the combined count of:
   * - Priority listeners (registered via `onWithOptions`/`onceWithOptions`)
   * - Regular Emittery listeners (registered via `on`/`once`)
   *
   * @param eventName - Event name(s) to count. Can be:
   *   - `undefined` - Count all listeners for all events
   *   - `string` - Count listeners for a specific event
   *   - `string[]` - Count listeners for multiple events
   * @returns Total number of listeners
   *
   * @example
   * ```typescript
   * // Count all listeners
   * const total = emitter.listenerCount()
   *
   * // Count listeners for specific event
   * const dataListeners = emitter.listenerCount('data')
   *
   * // Count listeners for multiple events
   * const multiCount = emitter.listenerCount(['data', 'error'])
   * ```
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
        const singleName = name as Name
        priorityCount += this._priorityListeners[singleName]?.size ?? 0
      }
      return priorityCount + super.listenerCount(eventName as readonly Name[])
    }
    // At this point, eventName is definitely Name (single event name)
    const singleEventName = eventName as Name
    const priorityCount = this._priorityListeners[singleEventName]?.size ?? 0
    return priorityCount + super.listenerCount(singleEventName)
  }
}
