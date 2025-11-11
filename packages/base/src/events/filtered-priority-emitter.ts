import { LinkedList } from '@/data'
import type { Args, BaseEventMap, LogLevelWithSilent } from '@repo/types'
import type { UnsubscribeFunction } from 'emittery'
import isPlainObject from 'is-plain-object'
import type { Jsonifiable, LiteralUnion, ReadonlyDeep, SetOptional } from 'type-fest'
import { safeFormatPayload, serializeError } from '../utils/format-payload.js'
import type { AllEvents } from './events-types.js'
import { LoggedEmitter } from './logged-emitter.js'
import { INTERNAL_ON_EMIT_ERROR, INTERNAL_ON_LISTENER_ERROR } from './private-events.js'
import type {
  ListenerCallback,
  Priority,
  PriorityListener,
  PriorityListenerOptions,
} from './types.js'

type EmitOptions = SetOptional<{ skipBaseListeners: boolean }, 'skipBaseListeners'>

type RegisteredListener<EventMap, EventName extends keyof EventMap> = ReadonlyDeep<
  PriorityListener<EventMap, EventName>
>

// --- Readability Type Aliases ---
/** Event key type supporting string unions */
type EventKey<EventMap> = LiteralUnion<keyof EventMap, string>
/** Event argument tuple type */
type EventArgs<EventMap, Name extends keyof EventMap> = Args<EventMap[Name]>
/** Error handler callback for listeners */
type ListenerErrorHandler<EventMap, Name extends keyof EventMap> = (
  event: Name,
  err: unknown,
  name: string,
) => void
/** Linked list of listeners for an event */
type ListenerList<EventMap, Name extends keyof EventMap> = LinkedList<
  PriorityListener<EventMap, Name>
>
/** Map of event keys to listener lists */
type PriorityListenerMap<EventMap> = Map<
  EventKey<EventMap>,
  LinkedList<PriorityListener<EventMap, any>>
>

/**
 * FilteredPriorityEmitter: priority + filter listeners + one-time support.
 * Extends LoggedEmitter for structured logging.
 *
 * @template EventMap - The event map defining event names and their data types
 */
export abstract class FilteredPriorityEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends LoggedEmitter<EventMap> {
  // --- Private Properties ---
  private readonly priorityListenerMap: PriorityListenerMap<EventMap> = new Map()

  private _sequenceCounter = 0

  private _nextSequence(): number {
    if (this._sequenceCounter >= Number.MAX_SAFE_INTEGER) {
      this._sequenceCounter = 0
    }
    return this._sequenceCounter++
  }

  private async _emitSuperSafe<EventName extends EventKey<EventMap>>( // Event key type alias
    event: EventName,
    ...args: AllEvents<EventMap>[EventName] extends undefined
      ? []
      : [AllEvents<EventMap>[EventName]]
  ): Promise<void> {
    try {
      // TypeScript limitation: variadic tuple type for event args is not assignable to base emitter signature
      // This cast is safe because we control the event and its payload
      await super.emit.call(this, event, ...(args as any))
    } catch (err) {
      this.log?.error?.(
        await safeFormatPayload({ event: normalizeKey(event), error: serializeError(err) }),
        'Error during super.emit call',
      )
    }
  }

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
    const list = createOrGetListenerList(this.priorityListenerMap, event)
    const listener = createPriorityListener(callback, options, this._nextSequence())
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
    let unsubscribe: UnsubscribeFunction
    const wrapped = createOnceWrapper(callback, () => unsubscribe())
    unsubscribe = this.onWithOptions(event, wrapped, options)
    return unsubscribe
  }

  /**
   * Emit an event with priority listeners, handling errors and calling super.emit.
   * @param event - The event name to emit
   * @param args - Arguments to pass to listeners
   * @returns Promise that resolves when all listeners complete
   */
  public async emitPriority<EventName extends keyof EventMap>(
    event: EventName,
    ...argsAndMaybeOptions: [...Args<EventMap[EventName]>, { skipBaseListeners?: boolean }?]
  ): Promise<void> {
    const [args, options] = extractEmitOptions(argsAndMaybeOptions)

    const list = this.priorityListenerMap.get(event)

    const errors = await executePriorityListeners(list, event, args, (evt, err, name) => {
      try {
        this.recordListenerErrorFor(evt, err, name)
      } catch {}
    })

    if (errors.length) {
      await this._emitSuperSafe('error', ...(errors as any))
    }

    if (!options?.skipBaseListeners) {
      await this._emitSuperSafe(event, ...(args as any))
    }
  }

  /**
   * Hook for subclasses or mixins to record listener errors. Default is no-op.
   * Allows type-safe override without as any casts.
   */
  protected recordListenerErrorFor<EventName extends keyof EventMap>(
    _event: EventName,
    _err: unknown,
    _name: string,
  ): void {}

  /**
   * Remove all priority listeners for a given event or all events.
   * @param event - Optional event name to target. If omitted, clears ALL priority listeners
   */
  public removePriorityListeners<EventName extends keyof EventMap>(
    event?: LiteralUnion<EventName, string>,
  ): void {
    clearListenersMap(this.priorityListenerMap, event as any)
  }

  /**
   * Count all listeners (priority + base) for an event or all events.
   * @param eventName - Event name(s) to count. Can be undefined, a string, or an array of strings
   * @returns Total number of listeners
   */
  public listenerCount<Name extends keyof EventMap>(
    eventName?: LiteralUnion<Name, string> | ReadonlyArray<Name>,
  ): number {
    const priorityCount = countPriorityListeners(this.priorityListenerMap, eventName as any)
    return priorityCount + super.listenerCount(eventName as any)
  }

  constructor() {
    super()

    const ctor = this.constructor as typeof FilteredPriorityEmitter & {
      onGlobal?: typeof FilteredPriorityEmitter.onGlobal
    }
    ctor.onGlobal?.(INTERNAL_ON_LISTENER_ERROR, async (payload) => {
      const [
        eventName = INTERNAL_ON_LISTENER_ERROR,
        error = new Error('Unknown listener error'),
        context = {},
      ] = payload

      const formattedEventName = normalizeKey(eventName)
      const formattedError = serializeError(error)
      const formattedContext = await safeFormatPayload(context as Jsonifiable)
      const safePayload = await safeFormatPayload({
        event: 'INTERNAL_ON_LISTENER_ERROR',
        eventName: formattedEventName,
        error: formattedError,
        context: formattedContext,
        shouldThrow: true,
      })

      this.log.error(safePayload, 'Internal listener error')
    })

    ctor.onGlobal?.(INTERNAL_ON_EMIT_ERROR, async (payload) => {
      const [
        eventName = INTERNAL_ON_EMIT_ERROR,
        error = new Error('Unknown emit error'),
        context = {},
      ] = payload

      const formattedEventName = normalizeKey(eventName)
      const formattedError = serializeError(error)
      const formattedContext = await safeFormatPayload(context as Jsonifiable)
      const safePayload = await safeFormatPayload({
        event: 'INTERNAL_ON_EMIT_ERROR',
        eventName: formattedEventName,
        error: formattedError,
        context: formattedContext,
        shouldThrow: true,
      })

      this.log.error(safePayload, 'Internal emit error')
    })
  }
}

/**
 * Normalize a PropertyKey into a string key suitable for Map lookups.
 */
export function normalizeKey(key: PropertyKey): string {
  return typeof key === 'symbol' ? (key.description ?? String(key)) : String(key)
}

/**
 * Normalize a log level name or number into a consistent string key.
 */
export function normalizeLevel(level: string | number): string {
  if (typeof level === 'number') return String(level)
  return level.toLowerCase()
}

/**
 * Check if a given log level is enabled under the current threshold.
 */
export function isLogLevelEnabled(
  currentLevel: LogLevelWithSilent,
  targetLevel: LogLevelWithSilent,
  levelMap: { [level: string]: number },
): boolean {
  const currentValue = levelMap[currentLevel]
  const targetValue = levelMap[targetLevel]
  return (
    typeof currentValue === 'number' &&
    typeof targetValue === 'number' &&
    targetValue >= currentValue
  )
}

function createOrGetListenerList<EventMap, EventName extends keyof EventMap>(
  lists: PriorityListenerMap<EventMap>,
  event: EventName,
): ListenerList<EventMap, EventName> {
  // now the map uses EventKey keys so we can do a typed get without odd casts
  let list = lists.get(event as EventKey<EventMap>) as ListenerList<EventMap, EventName> | undefined

  if (!list) {
    list = new LinkedList<PriorityListener<EventMap, EventName>>(
      (a, b) => b.priority - a.priority || a.sequence - b.sequence,
    )
    lists.set(event as EventKey<EventMap>, list as LinkedList<PriorityListener<EventMap, any>>)
  }
  return list
}

function createPriorityListener<EventMap, EventName extends keyof EventMap>(
  callback: ListenerCallback<EventMap, EventName>,
  options: PriorityListenerOptions<EventMap, EventName> | undefined,
  sequence: number,
): RegisteredListener<EventMap, EventName> {
  const listener: RegisteredListener<EventMap, EventName> = Object.freeze({
    callback,
    priority: (options?.priority ?? 0) as Priority,
    filter: options?.filter,
    sequence,
  })
  return listener
}

function createOnceWrapper<T extends (...args: any[]) => any>(
  callback: T,
  unsubscribe: () => void,
): (...args: Parameters<T>) => Promise<void> {
  let called = false
  return async (...args: Parameters<T>) => {
    if (called) return
    called = true
    unsubscribe()
    // await in case callback returns a promise
    await callback(...args)
  }
}

async function executePriorityListeners<EventMap, EventName extends keyof EventMap>(
  list: ListenerList<EventMap, EventName> | undefined,
  event: EventName,
  args: EventArgs<EventMap, EventName>,
  recordError?: ListenerErrorHandler<EventMap, EventName>,
  { parallel = false }: { parallel?: boolean } = {},
): Promise<unknown[]> {
  const errors: unknown[] = []
  if (!list) return errors

  if (parallel) {
    const promises = Array.from(list).map(async (listener) => {
      try {
        if (!listener.filter || listener.filter(...(args as any))) {
          await listener.callback(...(args as any))
        }
      } catch (err) {
        errors.push(err)
        recordError?.(event, err, listener.callback?.name ?? 'anonymous')
      }
    })
    await Promise.all(promises)
    return errors
  }

  // serial (original)
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
  map: PriorityListenerMap<EventMap>,
  event?: EventKey<EventMap>,
): void {
  if (typeof event !== 'undefined') {
    map.get(event)?.clear()
    map.delete(event)
  } else {
    map.forEach((list) => list.clear())
    map.clear()
  }
}

function countPriorityListeners<EventMap>(
  map: PriorityListenerMap<EventMap>,
  eventName?: EventKey<EventMap> | ReadonlyArray<EventKey<EventMap>>,
): number {
  if (!eventName) {
    let total = 0
    for (const list of map.values()) {
      total += list?.size ?? 0
    }
    return total
  }
  const names: ReadonlyArray<EventKey<EventMap>> = Array.isArray(eventName)
    ? eventName
    : [eventName]
  return names.reduce((acc: number, name) => acc + (map.get(name)?.size ?? 0), 0)
}

function extractEmitOptions<Args extends unknown[]>(
  args: [...Args, EmitOptions?],
): [Args, EmitOptions | undefined] {
  if (args.length === 0) return [args as unknown as Args, undefined]
  const last = args[args.length - 1]
  if (isEmitOptions(last)) {
    return [args.slice(0, -1) as unknown as Args, last]
  }
  return [args as unknown as Args, undefined]
}

function isEmitOptions(obj: unknown): obj is EmitOptions {
  return isPlainObject(obj) && 'skipBaseListeners' in (obj as EmitOptions)
}
