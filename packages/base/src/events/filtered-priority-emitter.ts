import { LinkedList } from "@/data"
import { DEV_MODE } from "@/env"
import { BaseError } from "@/errors"
import type {
  AllEventKeys,
  AllEvents,
  BasePriorityListener,
  EmitterEventKey,
  ListenerCallback,
  ListenerList,
  Priority,
  PriorityLinkedList,
  PriorityListenerOptions,
  RegisteredListener,
  UnsafeListenerListCast,
} from "@/events"
import { LISTENER_COUNT_CACHE_THRESHOLD, LoggedEmitter, brandPriorityLinkedList } from "@/events"
import { isObject, safeFormatPayload, serializeError } from "@/utils"
import type { Args, BaseEventMap } from "@repo/types"
import type { Jsonifiable } from "type-fest"
import type { UnsubscribeFunction } from "emittery"

export type PLMap<EventMap extends BaseEventMap> = Map<
  EmitterEventKey<EventMap>,
  PriorityLinkedList<BasePriorityListener<EventMap, EmitterEventKey<EventMap>>>
>

/**
 * FilteredPriorityEmitter: An event emitter with priority-based listener execution and filtering.
 * Extends LoggedEmitter for structured logging capabilities.
 *
 * Features:
 * - Priority-based listener execution (higher priority listeners execute first)
 * - Event filtering (listeners can specify conditions for when they should execute)
 * - One-time listener support
 * - Structured error handling and logging
 *
 * @template EventMap - The event map defining event names and their data types
 */
export abstract class FilteredPriorityEmitter<
  EventMap extends BaseEventMap = BaseEventMap,
> extends LoggedEmitter<EventMap> {
  /**
   * Map storing priority listeners organized by event name.
   * This is the core data structure for priority-based listener management.
   *
   * Note: Uses unknown for internal storage to avoid complex generic type casting.
   * Type safety is maintained through branding and runtime invariant checks.
   */
  private readonly priorityListenerMap = new Map<
    EmitterEventKey<EventMap>,
    PriorityLinkedList<BasePriorityListener<EventMap, EmitterEventKey<EventMap>>>
  >()

  /**
   * Adaptive cache for listener counts per event, enabled only for large deployments.
   */
  private _listenerCountCache?: Map<EmitterEventKey<EventMap>, number>
  private _useListenerCountCache = false

  /**
   * Counter for assigning unique sequence numbers to listeners.
   * Ensures deterministic execution order for listeners with the same priority.
   */
  private _sequenceCounter = 0

  /**
   * Map of event key to listeners with filters for fast filtering.
   */
  private filterGroups: Map<
    EmitterEventKey<EventMap> | "*",
    RegisteredListener<EventMap, EmitterEventKey<EventMap>>[]
  > = new Map()

  /**
   * Remove all listeners for all events and reset caches.
   */
  public clearAllListeners(): void {
    this.priorityListenerMap.clear()
    this._resetListenerCountCache()
  }

  /**
   * Reset the listener count cache and disable its use.
   */
  private _resetListenerCountCache() {
    this._listenerCountCache = undefined
    this._useListenerCountCache = false
  }

  /**
   * Enable the listener count cache and populate it from current state.
   */
  private _enableListenerCountCache() {
    this._listenerCountCache = new Map()
    for (const [key, list] of this.priorityListenerMap.entries()) {
      let count = 0
      for (const _ of list) count++
      if (count > 0) this._listenerCountCache.set(key, count)
    }
    this._useListenerCountCache = true
  }

  /**
   * Add a listener with priority and optional filtering.
   * @param event - The event name to listen for
   * @param callback - The function to call when the event is emitted
   * @param options - Optional configuration object (priority, filter)
   * @returns Unsubscribe function to remove this listener
   */
  public onWithPriority<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
    callback: ListenerCallback<EventMap, EventName>,
    options?: PriorityListenerOptions<EventMap, EventName>,
  ): UnsubscribeFunction {
    // Only create the list if actually adding a listener
    const list = this.createOrGetListenerList(event)
    const listener = this.createPriorityListener(callback, options)
    // Use push: for branded priority lists, this is stable and correct
    list.push(listener)
    this._resetListenerCountCache()

    // Memoize filter by event key for fast filtering
    addListenerToFilterGroup(listener.filter, this.filterGroups, event, listener)

    // Adaptive cache: enable if threshold exceeded
    if (
      !this._useListenerCountCache &&
      this.priorityListenerMap.size > LISTENER_COUNT_CACHE_THRESHOLD
    ) {
      this._enableListenerCountCache()
    }
    if (this._useListenerCountCache && this._listenerCountCache) {
      const key = event as EmitterEventKey<EventMap>
      this._listenerCountCache.set(key, (this._listenerCountCache.get(key) ?? 0) + 1)
    }

    // Use helper function for safe unsubscribe, pass logger callback for warnings
    const unsubscribe = createSafeUnsubscribe(
      list,
      listener,
      event,
      (context, msg) => this.log?.warn?.(context, msg),
      this.filterGroups,
      event as EmitterEventKey<EventMap>,
    )
    // Patch unsubscribe to update cache if enabled
    if (this._useListenerCountCache && this._listenerCountCache) {
      return () => {
        const key = event as EmitterEventKey<EventMap>
        const cache = this._listenerCountCache
        if (cache?.has(key)) {
          const prev = cache.get(key) ?? 1
          if (prev <= 1) {
            cache.delete(key)
          } else {
            cache.set(key, prev - 1)
          }
        }
        unsubscribe()
      }
    }
    return unsubscribe
  }

  /**
   * Add a one-time listener with priority and optional filtering.
   * The listener will be removed after the first time the event is emitted and the filter (if any) passes.
   * @param event - The event name to listen for
   * @param callback - The function to call when the event is emitted (only once)
   * @param options - Optional configuration object (priority, filter)
   * @returns Unsubscribe function to remove this listener before it fires
   */
  public onceWithPriority<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
    callback: ListenerCallback<EventMap, EventName>,
    options?: PriorityListenerOptions<EventMap, EventName>,
  ): UnsubscribeFunction {
    const { wrapped, setUnsubscribe } = createOnceListener(callback)
    const unsubscribe = this.onWithPriority(event, wrapped, options)
    setUnsubscribe(unsubscribe)
    return unsubscribe
  }

  /**
   * Remove all listeners for an event with the specified priority.
   * @param event - The event name
   * @param priority - Priority level to remove
   * @returns Number of listeners removed
   */
  public removePriorityListeners<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
    priority: Priority,
  ): number {
    const list = getPriorityListenerList<EventMap, EventName>(this.priorityListenerMap, event)
    if (!list) return 0
    // Remove listeners and update filterGroups
    let removed = 0
    const toRemove: RegisteredListener<EventMap, EmitterEventKey<EventMap>>[] = []
    for (const l of list) {
      if (l.priority === priority)
        toRemove.push(l as RegisteredListener<EventMap, EmitterEventKey<EventMap>>)
    }
    removed = list.removeWhere(listener => listener.priority === priority)
    if (toRemove.length) {
      const key = event as EmitterEventKey<EventMap>
      const group = this.filterGroups.get(key)
      if (group) {
        const filtered = group.filter(l => !toRemove.includes(l))
        if (filtered.length) {
          this.filterGroups.set(key, filtered)
        } else {
          this.filterGroups.delete(key)
        }
      }
    }
    // Prune listener count cache entry if enabled and count is now zero
    if (this._useListenerCountCache && this._listenerCountCache) {
      const key = event as EmitterEventKey<EventMap>
      const list = this.priorityListenerMap.get(key)
      let count = 0
      if (list) {
        for (const _ of list) count++
      }
      if (count === 0) {
        this._listenerCountCache.delete(key)
      } else {
        this._listenerCountCache.set(key, count)
      }
    }
    this._resetListenerCountCache()
    return removed
  }

  /**
   * Get count of listeners for an event (or all events if no event specified).
   * Uses safe iteration-based counting to ensure accuracy.
   *
   * @param event - Optional specific event name
   * @returns Number of listeners
   */
  public listenerCount<EventName extends EmitterEventKey<EventMap>>(event?: EventName): number {
    if (this._useListenerCountCache && this._listenerCountCache) {
      if (event !== undefined) {
        return this._listenerCountCache.get(event as EmitterEventKey<EventMap>) ?? 0
      }
      let total = 0
      for (const count of this._listenerCountCache.values()) {
        total += count
      }
      return total
    }
    if (event !== undefined) {
      return countListenersForEvent(
        event as EmitterEventKey<EventMap>,
        this.priorityListenerMap as PLMap<EventMap>,
      )
    }
    return countAllListeners(this.priorityListenerMap as PLMap<EventMap>)
  }

  /**
   * Check if a specific callback is registered for an event.
   * @param event - The event name
   * @param callback - The callback function to look for
   * @returns True if the callback is found
   */
  public hasListener<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
    callback: ListenerCallback<EventMap, EventName>,
  ): boolean {
    const list = getPriorityListenerList<EventMap, EventName>(this.priorityListenerMap, event)
    if (!list) return false
    return list.find(listener => listener.callback === callback) !== undefined
  }

  /**
   * Get all listeners with priority above a threshold for debugging.
   * @param event - The event name
   * @param minPriority - Minimum priority threshold
   * @returns Array of high-priority listeners
   */
  public getHighPriorityListeners<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
    minPriority: Priority,
  ): readonly RegisteredListener<EventMap, EventName>[] {
    const list = getPriorityListenerList<EventMap, EventName>(this.priorityListenerMap, event)
    if (!list) return []
    // Double-cast to satisfy readonly type expectation
    return list.filter(
      listener => listener.priority >= minPriority,
    ) as unknown as readonly RegisteredListener<EventMap, EventName>[]
  }

  /**
   * Unified emit that executes priority listeners first, then regular listeners.
   * This creates a predictable execution order where priority listeners act as
   * a "pre-processing" layer before normal event handling.
   */
  public override async emit<K extends AllEventKeys<EventMap>>(
    event: K,
    ...args: AllEvents<EventMap>[K] extends undefined ? [] : [AllEvents<EventMap>[K]]
  ): Promise<void> {
    // Convert parent's args format to our internal Args format
    const convertedArgs = args as unknown as Args<EventMap[K]>

    // 1. Execute priority listeners first (with filtering)
    await this.executePriorityListenersForEvent(
      event as EmitterEventKey<EventMap>,
      convertedArgs as unknown as Args<EventMap[EmitterEventKey<EventMap>]>, // force compatibility
    )

    // 2. Then execute regular listeners via parent class
    await super.emit(event, ...args)
  }

  /**
   * Internal method to execute priority listeners with error handling.
   * Separated for clarity and potential reuse.
   */
  private async executePriorityListenersForEvent<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
    args: Args<EventMap[EventName]>,
  ): Promise<void> {
    // Use grouped listeners for this event if available, else fall back to all listeners
    const key = event as EmitterEventKey<EventMap>
    const group = this.filterGroups.get(key)
    const wildcardGroup = this.filterGroups.get("*") || []
    let listeners: RegisteredListener<EventMap, EventName>[]
    if ((group && group.length > 0) || wildcardGroup.length > 0) {
      listeners = [...wildcardGroup, ...(group || [])] as RegisteredListener<EventMap, EventName>[]
    } else {
      const list = getPriorityListenerList<EventMap, EventName>(
        this.priorityListenerMap as PLMap<EventMap>,
        event,
      )
      if (!list) return
      listeners = Array.from(list) as RegisteredListener<EventMap, EventName>[]
    }
    const errors: unknown[] = []
    // Batch filter evaluation for all listeners
    const filterResults = await Promise.all(
      listeners.map(l => l.filter ? l.filter(...args) : true)
    )
    for (let i = 0; i < listeners.length; i++) {
      const listener = listeners[i]
      if (!listener) continue
      try {
        if (filterResults[i]) {
          await listener.callback(...args)
        }
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) {
      const context = await createEmitErrorContext(event as unknown as string | symbol, errors)
      this.log.error(
        {
          ...(context as Record<string, unknown>),
          shouldThrow: true,
          errorCount: errors.length,
        } as Record<string, unknown> & { shouldThrow: true },
        "Priority listeners encountered errors during emit",
      )
    }
  }

  /**
   * Generate the next sequence number with overflow protection.
   * When listeners have the same priority, sequence determines execution order (FIFO).
   */
  private _nextSequence(): number {
    // If the counter overflows, reset to 0.
    // Theoretical risk: If there are Number.MAX_SAFE_INTEGER active listeners,
    // this could cause sequence collisions. In practice, this is extremely unlikely.
    if (this._sequenceCounter >= Number.MAX_SAFE_INTEGER) {
      this._sequenceCounter = 0
    }
    return this._sequenceCounter++
  }

  private createOrGetListenerList<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
  ): ListenerList<EventMap, EventName> {
    const list = createOrGetListenerList(
      event,
      this.priorityListenerMap as unknown as Map<
        EmitterEventKey<EventMap>,
        PriorityLinkedList<BasePriorityListener<EventMap, EventName>>
      >,
      (context, msg) => this.log?.warn?.(context, msg),
    )
    devModeFastFailOnUnbrandedList(list, event)
    return list
  }

  /**
   * Create a priority listener object with the given callback and options.
   * Uses external helper function for listener creation.
   */
  private createPriorityListener<EventName extends EmitterEventKey<EventMap>>(
    callback: ListenerCallback<EventMap, EventName>,
    options?: PriorityListenerOptions<EventMap, EventName>,
  ): RegisteredListener<EventMap, EventName> {
    return createPriorityListener(callback, this._nextSequence(), options)
  }
}


/**
 * Remove a listener from filterGroups for a specific event.
 * Ensures no stale listeners remain after unsubscribe.
 */
function removeListenerFromFilterGroups<M extends BaseEventMap, N extends EmitterEventKey<M>>(
  filterGroups: Map<EmitterEventKey<M> | "*", RegisteredListener<M, N>[]>,
  eventName: EmitterEventKey<M>,
  listener: RegisteredListener<M, N>,
) {
  const group = filterGroups.get(eventName)
  if (!group) return
  const idx = group.indexOf(listener as unknown as RegisteredListener<M, N>)
  if (idx !== -1) {
    group.splice(idx, 1)
    if (group.length === 0) filterGroups.delete(eventName)
    else filterGroups.set(eventName, group)
  }
}

function unsafeCastListenerList<M extends BaseEventMap, N extends EmitterEventKey<M>>(
  list: PriorityLinkedList<BasePriorityListener<M, EmitterEventKey<M>>>,
): UnsafeListenerListCast<M, N> {
  return list as UnsafeListenerListCast<M, N>
}

/**
 * Helper to get a typed priority listener list from a map, or undefined if not present.
 */
function getPriorityListenerList<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
>(
  map: PLMap<EventMap>,
  event: EventName,
): PriorityLinkedList<BasePriorityListener<EventMap, EmitterEventKey<EventMap>>> | undefined {
  return map.get(event as EmitterEventKey<EventMap>)
}

/**
 * Create error context for failed emit operations.
 * Encapsulates the error formatting logic for consistent logging across all emit operations.
 */
async function createEmitErrorContext(event: string | symbol, errors: unknown | unknown[]) {
  try {
    // Ensure event is JSON-serializable for safeFormatPayload
    const serializableEvent = typeof event === "symbol" ? event.toString() : String(event)

    // Recursively serialize all nested errors for full stack trace inclusion
    function deepSerializeError(err: unknown): unknown {
      if (Array.isArray(err)) return err.map(deepSerializeError)
      if (err && isObject(err) && !(err instanceof Date)) {
        // If it's an Error or plain object, serialize and recurse into properties
        const serialized = serializeError(err)
        if (serialized && typeof serialized === "object") {
          for (const key of Object.keys(serialized)) {
            const value = (serialized as Record<string, unknown>)[key]
            if (isObject(value)) {
              (serialized as Record<string, unknown>)[key] = deepSerializeError(value)
            }
          }
        }
        return serialized
      }
      return err
    }
    const serializedErrors = deepSerializeError(errors)
    return await safeFormatPayload({
      event: serializableEvent,
      errors: serializedErrors as Jsonifiable,
      timestamp: Date.now(),
      emitterType: "FilteredPriorityEmitter2",
    })
  } catch (formatError) {
    // Fallback to minimal context if formatting fails
    return {
      event: String(event),
      errors: String(errors),
      formatError: String(formatError),
      timestamp: Date.now(),
    }
  }
}

/**
 * Execute priority listeners with error collection and filtering.
 * Centralizes the complex listener execution logic with proper error handling.
 */
async function executePriorityListeners<
  EventMap extends BaseEventMap<unknown[]>,
  EventName extends keyof EventMap,
>(list: ListenerList<EventMap, EventName>, args: Args<EventMap[EventName]>): Promise<unknown[]> {
  const errors: unknown[] = []

  for (const listener of list) {
    try {
      // Await filter result to support async filters
      const shouldRun = listener.filter ? await listener.filter(...args) : true
      if (shouldRun) {
        await listener.callback(...args)
      }
    } catch (error) {
      errors.push(error)
    }
  }

  return errors
}

/**
 * Validate and normalize listener priority value.
 * Ensures priority values are within acceptable ranges and properly typed.
 */
function validatePriority(priority?: number): Priority {
  if (priority === undefined || priority === null) {
    return 0 as Priority
  }

  if (typeof priority !== "number" || !Number.isFinite(priority)) {
    throw new BaseError("Priority validation failed", {
      code: "INVALID_PRIORITY_TYPE",
      category: "validation",
      metadata: {
        receivedType: typeof priority,
        receivedValue: priority,
        expectedType: "finite number",
        allowedRange: "-1000 to 1000",
      },
    })
  }

  // Clamp priority to reasonable bounds to prevent overflow issues
  const clampedPriority = Math.max(-1000, Math.min(1000, Math.floor(priority)))
  return clampedPriority as Priority
}

/**
 * Returns an idempotent unsubscribe function for a listener.
 * Uses sequence-based removal if available for robustness.
 *
 * @param list - The LinkedList of listeners
 * @param listener - The listener to remove
 * @param eventName - The event name
 * @param warnLogger - Optional logger for warnings
 */

function hasSequence(obj: unknown): obj is { sequence: number } {
  return isObject(obj) && typeof obj?.sequence === "number"
}

function createSafeUnsubscribe<
  T extends { sequence?: number },
  EventMap extends BaseEventMap = BaseEventMap,
  EventName extends EmitterEventKey<EventMap> = EmitterEventKey<EventMap>
>(
  list: LinkedList<T>,
  listener: T,
  eventName: string | symbol | number,
  warnLogger?: (context: object, msg: string) => void,
  filterGroups?: Map<EmitterEventKey<EventMap> | "*", RegisteredListener<EventMap, EventName>[]>,
  filterGroupKey?: EmitterEventKey<EventMap>,
): UnsubscribeFunction {
  let unsubscribed = false
  return () => {
    if (unsubscribed) return
    unsubscribed = true
    try {
      if (hasSequence(listener) && typeof list.removeWhere === "function") {
        const seq = listener.sequence
        list.removeWhere((item: T) => hasSequence(item) && item.sequence === seq)
      } else {
        list.remove(listener)
      }

      // Remove from filterGroups if provided
      if (filterGroups && filterGroupKey) {
        try {
          removeListenerFromFilterGroups(
            filterGroups as Map<EmitterEventKey<EventMap> | "*", RegisteredListener<EventMap, EventName>[]>,
            filterGroupKey as EmitterEventKey<EventMap>,
            listener as unknown as RegisteredListener<EventMap, EventName>
          )
        } catch (e) {
          // don't let filter cleanup blow up unsubscribe
          warnLogger?.({ event: eventName, error: e }, "Failed to remove listener from filterGroups")
        }
      }
    } catch (error) {
      warnLogger?.({ event: eventName, error }, "Failed to unsubscribe listener")
    }
  }
}

function createOrGetListenerList<M extends BaseEventMap, N extends EmitterEventKey<M>>(
  event: N,
  map: Map<EmitterEventKey<M>, PriorityLinkedList<BasePriorityListener<M, N>>>,
  warnLogger: (context: object, msg: string) => void,
): PriorityLinkedList<BasePriorityListener<M, N>> {
  // Use the event key as-is (symbol or string)
  const list = map.get(event as EmitterEventKey<M>)
  if (!list) {
    const newList = brandPriorityLinkedList(
      LinkedList.createPriorityList<BasePriorityListener<M, N>>(),
    )
    map.set(event as EmitterEventKey<M>, newList)
    return newList
  }
  return list
}

/**
 * Throws in dev mode if the provided list is not a branded PriorityList.
 * Used to fail fast and surface bugs early during development.
 */
function devModeFastFailOnUnbrandedList<T = unknown>(list: LinkedList<T>, event: string | symbol) {
  if (!LinkedList.isPriorityList(list) && DEV_MODE) {
    throw new BaseError("Unbranded LinkedList detected for event", {
      code: "UNBRANDED_PRIORITY_LIST",
      category: "invariant",
      metadata: {
        event: String(event),
        expectedType: "PriorityList",
        actualType: "LinkedList (unbranded)",
        possibleCause: "EventMap type conflicts or mixed emitter usage",
        details: [
          `Event: ${String(event)}`,
          "Expected a branded PriorityList. This likely indicates a bug or type conflict.",
        ],
      },
    })
  }
}

function createPriorityListener<M extends BaseEventMap, N extends keyof M>(
  callback: ListenerCallback<M, N>,
  sequence: number,
  options?: PriorityListenerOptions<M, N>,
): RegisteredListener<M, N> {
  const priority = validatePriority(options?.priority)

  const listener = {
    callback,
    priority,
    filter: options?.filter,
    sequence,
  }

  return Object.freeze(listener)
}

export function createOnceListener<M extends BaseEventMap, N extends keyof M>(
  callback: ListenerCallback<M, N>,
) {
  let unsubscribed = false
  let unsubscribe: (() => void) | undefined
  const wrapped = async (...args: Parameters<typeof callback>) => {
    if (unsubscribed) return
    unsubscribed = true
    unsubscribe?.()
    await callback(...args)
  }
  const setUnsubscribe = (fn: () => void) => {
    unsubscribe = fn
  }
  return { wrapped, setUnsubscribe }
}

/**
 * Count listeners for a specific event using safe iteration.
 * Encapsulates the event-specific counting logic with proper type handling.
 */
function countListenersForEvent<M extends BaseEventMap, N extends EmitterEventKey<M>>(
  event: N,
  map: Map<EmitterEventKey<M>, PriorityLinkedList<BasePriorityListener<M, N>>>,
): number {
  // Use the event key as-is (symbol or string)
  const list = map.get(event as EmitterEventKey<M>)
  if (!list) return 0
  // Safe counting via iteration (defensive programming)
  let count = 0
  for (const _ of list) count++
  return count
}

// === Listener Counting Helpers ===

function countAllListeners<EventMap extends BaseEventMap>(map: PLMap<EventMap>): number {
  let total = 0
  for (const list of map.values()) {
    total += countListItems(list)
  }
  return total
}

function countListItems<T>(list: LinkedList<T>): number {
  let count = 0
  for (const _ of list) count++
  return count
}

// === Filter Group Helper ===

/**
 * Adds a listener to the filterGroups map for the given event key if the filter is defined.
 * Ensures the group array is created if it does not exist.
 */
function addListenerToFilterGroup<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
>(
  filter: RegisteredListener<EventMap, EventName>["filter"] | undefined,
  filterGroups: Map<EmitterEventKey<EventMap> | "*", RegisteredListener<EventMap, EventName>[]>,
  event: EventName,
  listener: RegisteredListener<EventMap, EventName>,
): void {
  if (!filter) return

  const key = event as EventName
  const group = filterGroups.get(key) || []
  group.push(listener)
  filterGroups.set(key, group)
}
