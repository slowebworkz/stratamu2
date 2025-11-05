import { LinkedList } from '@/data'
import type { Args, BaseEventMap } from '@repo/types'
import type { UnsubscribeFunction } from 'emittery'
import type { LiteralUnion, Simplify, SetRequired, ValueOf } from 'type-fest'
import { LoggedEmitter } from './logged-emitter.js'
import type {
  ListenerCallback,
  Priority,
  PriorityListener,
  PriorityListenerOptions,
} from './types.js'

/**
 * FilteredPriorityEmitter: priority + filter listeners + one-time support.
 * Extends LoggedEmitter for structured logging.
 *
 * @template EventMap - The event map defining event names and their data types
 */
export abstract class FilteredPriorityEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>
> extends LoggedEmitter<EventMap> {
  // --- Private Properties ---
  private _priorityListeners: {
    [EventName in keyof EventMap]?: LinkedList<PriorityListener<EventMap, EventName>>
  } = {}

  private _sequenceCounter = 0

  // --- Public API ---

  /**
   * Add a listener with options (priority, filter, etc).
   * @param event - The event name to listen for
   * @param callback - The function to call when the event is emitted
   * @param options - Optional configuration object (priority, filter)
   * @returns Unsubscribe function to remove this listener
   */
  public onWithOptions<EventName extends keyof EventMap>(
    event: EventName,
    callback: ListenerCallback<EventMap, EventName>,
    options?: PriorityListenerOptions<EventMap, EventName>,
  ): UnsubscribeFunction {
    const list = createOrGetListenerList(this._priorityListeners, event)
    const listener = createPriorityListener(callback, options, this._sequenceCounter++)
    list.sortedInsert(listener)
    return () => {
      list.remove(listener)
    }
  }

  /**
   * Add a one-time listener with options.
   * @param event - The event name to listen for
   * @param callback - The function to call when the event is emitted (only once)
   * @param options - Optional configuration object (priority, filter)
   * @returns Unsubscribe function to remove this listener before it fires
   */
  public onceWithOptions<EventName extends keyof EventMap>(
    event: EventName,
    callback: ListenerCallback<EventMap, EventName>,
    options?: PriorityListenerOptions<EventMap, EventName>,
  ): UnsubscribeFunction {
    let unsubscribe: UnsubscribeFunction = () => { }
    const wrapped = createOnceWrapper<ListenerCallback<EventMap, EventName>>(
      async (...args: Args<EventMap[EventName]>) => {
        await callback(...args)
      },
      () => unsubscribe(),
    )
    unsubscribe = this.onWithOptions(event, wrapped, options)
    return unsubscribe
  }

  /**
   * Emit an event with priority listeners, handling errors and calling super.emit.
   * @param event - The event name to emit
   * @param args - Arguments to pass to listeners
   * @returns Promise that resolves when all listeners complete
   */
  public async emitWithPriority<EventName extends keyof EventMap>(
    event: EventName,
    ...args: Args<EventMap[EventName]>
  ): Promise<void> {
    const list = this._priorityListeners[event]
    const errors = await executePriorityListeners(list, event, args, (evt, err, name) => {
      try {
        ; (this as any).recordListenerErrorFor?.(evt as any, err, name)
      } catch {
        void 0
      }
    })
    if (errors.length) {
      // Type-safe error emission: only emit if 'error' is a valid event
      if (typeof super.emit === 'function') {
        await (super.emit as any)('error', errors)
      }
    }
    if (typeof super.emit === 'function') {
      if (args.length > 0) {
        await (super.emit as any)(event, ...args)
      } else {
        await (super.emit as any)(event)
      }
    }
  }

  /**
   * Remove all priority listeners for a given event or all events.
   * @param event - Optional event name to target. If omitted, clears ALL priority listeners
   */
  public clearPriorityListeners<EventName extends keyof EventMap>(event?: LiteralUnion<EventName, string>): void {
    clearListenersMap(this._priorityListeners, event as any)
  }

  /**
   * Count all listeners (priority + base) for an event or all events.
   * @param eventName - Event name(s) to count. Can be undefined, a string, or an array of strings
   * @returns Total number of listeners
   */
  public listenerCount<Name extends keyof EventMap>(
    eventName?: LiteralUnion<Name, string> | ReadonlyArray<Name>,
  ): number {
    const priorityCount = countPriorityListeners(this._priorityListeners, eventName as any)
    return priorityCount + super.listenerCount(eventName as any)
  }
}

function createOrGetListenerList<EventMap, EventName extends keyof EventMap>(
  lists: { [K in keyof EventMap]?: LinkedList<PriorityListener<EventMap, K>> },
  event: EventName,
): LinkedList<PriorityListener<EventMap, EventName>> {
  return (lists[event] ??= new LinkedList<PriorityListener<EventMap, EventName>>(
    (a, b) => b.priority - a.priority || a.sequence - b.sequence,
  ))
}

function createPriorityListener<EventMap, EventName extends keyof EventMap>(
  callback: ListenerCallback<EventMap, EventName>,
  options: PriorityListenerOptions<EventMap, EventName> | undefined,
  sequence: number,
): Simplify<PriorityListener<EventMap, EventName>> {
  return {
    callback,
    priority: (options?.priority ?? 0) as Priority,
    filter: options?.filter,
    sequence,
  }
}

function createOnceWrapper<T extends (...args: any[]) => any>(
  callback: T,
  unsubscribe: () => void,
): SetRequired<(...args: Parameters<T>) => Promise<void>, never> {
  let called = false
  return async (...args) => {
    if (called) return
    called = true
    unsubscribe()
    await callback(...args)
  }
}

async function executePriorityListeners<EventMap, EventName extends keyof EventMap>(
  list: LinkedList<PriorityListener<EventMap, EventName>> | undefined,
  event: EventName,
  args: Args<EventMap[EventName]>,
  recordError?: (event: EventName, err: unknown, name: string) => void,
): Promise<unknown[]> {
  const errors: unknown[] = []
  if (!list) return errors

  for (const listener of list) {
    try {
      if (!listener.filter || listener.filter(...(args as any))) {
        await listener.callback(...(args as any))
      }
    } catch (err) {
      errors.push(err)
      recordError?.(event, err, listener.callback?.name ?? 'anonymous')
    }
  }

  return errors
}

function clearListenersMap<EventMap>(
  map: { [K in keyof EventMap]?: LinkedList<any> },
  event?: keyof EventMap,
): void {
  if (event) map[event]?.clear()
  else for (const key in map) map[key]?.clear()
}

function countPriorityListeners<EventMap>(
  map: { [K in keyof EventMap]?: LinkedList<any> },
  eventName?: LiteralUnion<keyof EventMap, string> | ReadonlyArray<keyof EventMap>,
): number {
  if (!eventName) {
    return (Object.values(map) as Array<ValueOf<typeof map>>).reduce(
      (acc: number, list) => acc + (list?.size ?? 0),
      0,
    )
  }
  const names: ReadonlyArray<keyof EventMap> = Array.isArray(eventName)
    ? (eventName as ReadonlyArray<keyof EventMap>)
    : [eventName as keyof EventMap]
  return names.reduce((acc: number, name: keyof EventMap) => acc + (map[name]?.size ?? 0), 0)
}
