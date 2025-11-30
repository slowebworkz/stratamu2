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
  PriorityListenerOptions,
  RegisteredListener,
  UnsafeListenerListCast,
} from "@/events"
import { LISTENER_COUNT_CACHE_THRESHOLD, LoggedEmitter } from "@/events"
import { isObject, safeFormatPayload, serializeError } from "@/utils"
import type { Args, BaseEventMap } from "@repo/types"
import type { Jsonifiable } from "type-fest"
import type { UnsubscribeFunction } from "emittery"

const PRIORITY_LINKED_LIST_BRAND = Symbol("PriorityLinkedList")

// === Types ===

// Set of registered listeners for any event in the event map
type RegisteredListenerSet<EventMap extends BaseEventMap> = Set<
  RegisteredListenerForAnyEvent<EventMap>
>

export type PriorityLinkedList<T> = LinkedList<T> & {
  readonly __brand: typeof PRIORITY_LINKED_LIST_BRAND
}

type PLMap<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap> = EmitterEventKey<EventMap>,
> = Map<EmitterEventKey<EventMap>, PriorityLinkedList<BasePriorityListener<EventMap, EventName>>>

// Type alias for a listener for a specific event
type Listener<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap> = EmitterEventKey<EventMap>,
> = BasePriorityListener<EventMap, EventName>

// Type alias for a priority linked list of listeners for a specific event
type ListenerListForEvent<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap> = EmitterEventKey<EventMap>,
> = PriorityLinkedList<BasePriorityListener<EventMap, EventName>>

// Type alias for a registered listener for any event in the event map
type RegisteredListenerForAnyEvent<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap> = EmitterEventKey<EventMap>,
> = RegisteredListener<EventMap, EventName>

// === class FilteredPriorityEmitter ===

// === class FilteredPriorityEmitter

export abstract class FilteredPriorityEmitter<
  EventMap extends BaseEventMap = BaseEventMap,
> extends LoggedEmitter<EventMap> {
  // Core listener registry (priority linked lists)
  private registry = new PriorityListenerRegistry<EventMap>()

  // Optional filter/wildcard groups
  private filterRegistry = new FilterGroupRegistry<EventMap>()

  /**
   * Register a listener for an event.
   * - If the listener has a priority, it is handled by the priority registry.
   * - Otherwise, it defaults to the base emitter behavior.
   */
  public on<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
    listener: BasePriorityListener<EventMap, EventName>,
  ) {
    // RegisteredListener<EventMap, EventName> | UnsubscribeFunction

    // Check if listener doesn't have a priority property
    if (typeof listener?.priority !== "number") {
      // Wrap the callback to match ListenerFn signature
      return super.on(event, (...args: EventMap[EventName]) => listener.callback(...args))
    }
  }
}

// === class PriorityListenerRegistry ===

class PriorityListenerRegistry<EventMap extends BaseEventMap = BaseEventMap> {
  private readonly map = new Map<
    EmitterEventKey<EventMap>,
    PriorityLinkedList<BasePriorityListener<EventMap, EmitterEventKey<EventMap>>>
  >()

  private sequenceCounter = 0

  private readonly cache = new PriorityListenerCountCache<EventMap>()

  private getOrCreateList<EventName extends EmitterEventKey<EventMap>>(event: EventName) {
    return (() => {
      const existing = this.map.get(event)
      if (existing) return existing

      // Create the new list as the specific EventName type
      const newList = brandPriorityLinkedList(
        LinkedList.createPriorityList<BasePriorityListener<EventMap, EventName>>(),
      )
      // Store as the broad type for the map
      this.map.set(event, newList as ListenerListForEvent<EventMap, EmitterEventKey<EventMap>>)

      return newList
    })() as ListenerListForEvent<EventMap, EventName>
  }

  private nextSequence() {
    return this.sequenceCounter++
  }

  public add<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
    listener: Omit<BasePriorityListener<EventMap, EventName>, "sequence">,
  ): RegisteredListener<EventMap, EventName> {
    const withSequence = { ...listener, sequence: this.nextSequence() }

    const list = this.getOrCreateList(event)
    list.push(withSequence)

    this.cache.increment(event)

    return withSequence
  }
}

// === class PriorityListenerCountCache ===

/**
 * ListenerCountCache manages cached counts of listeners per event.
 * Designed for large-scale emitters where counting on-the-fly is expensive.
 */
export class PriorityListenerCountCache<EventMap extends BaseEventMap = BaseEventMap> {
  /**
   * Adaptive cache for listener counts per event, enabled only for large deployments.
   */
  private cache = new Map<EmitterEventKey<EventMap>, number>()

  private enabled = false

  /**
   * Enable the cache and optionally pre-populate from a registry
   */
  public enable<Initial extends typeof this.cache>(initialCounts?: Initial) {
    this.enabled = true

    if (initialCounts) {
      this.cache = new Map(initialCounts)
    }
  }

  /**
   * Disable the cache and clear stored counts
   */
  public disable() {
    this.enabled = false

    this.cache.clear()
  }

  /**
   * Increment count for a specific event
   */
  public increment<EventName extends EmitterEventKey<EventMap>>(event: EventName) {
    if (!this.enabled) return

    this.cache.set(event, (this.cache.get(event) ?? 0) + 1)
  }

  /**
   * Decrement count for a specific event, removing if zero
   */
  public decrement<EventName extends EmitterEventKey<EventMap>>(event: EventName) {
    if (!this.enabled) return

    const current = this.cache.get(event)

    if (current === undefined) return
    if (current <= 1) this.cache.delete(event)
    else this.cache.set(event, current - 1)
  }

  /**
   * Get the count for a specific event, or total if no event is provided
   */
  public get<EventName extends EmitterEventKey<EventMap>>(event?: EventName) {
    if (!this.enabled) return 0

    if (event !== undefined) {
      return this.cache.get(event) ?? 0
    }

    let total = 0
    for (const count of this.cache.values()) {
      total += count
    }

    return total
  }

  /**
   * Check if the cache is currently enabled
   */
  public isEnabled(): boolean {
    return this.enabled
  }
}

// === class FilterGroupRegistry ===

class FilterGroupRegistry<EventMap extends BaseEventMap = BaseEventMap> {
  private groups = new Map<EmitterEventKey<EventMap> | "*", RegisteredListenerSet<EventMap>>()

  public add<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
    listener: RegisteredListenerForAnyEvent<EventMap>,
  ): void {
    if (!listener.filter) return

    const group = (() => {
      const existingGroup = this.groups.get(event)
      if (existingGroup) return existingGroup

      const newGroup = new Set<RegisteredListenerForAnyEvent<EventMap>>()
      this.groups.set(event, newGroup)

      return newGroup
    })()

    group.add(listener)
  }

  public remove<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
    listener: RegisteredListenerForAnyEvent<EventMap>,
  ): void {
    const group = this.groups.get(event)
    if (!group) return

    if (group.has(listener)) {
      group.delete(listener)

      if (group.size === 0) this.groups.delete(event)
      else this.groups.set(event, group)
    }
  }

  /**
   * Collect all listeners for an event, including wildcards.
   */
  /**
   * Collect all listeners for an event, including wildcards (only for string event keys).
   * If the event key is a symbol, only symbol-specific listeners are returned.
   */
  public collect<EventName extends EmitterEventKey<EventMap>>(
    event: EventName,
  ): RegisteredListenerForAnyEvent<EventMap>[] {
    const results: RegisteredListenerForAnyEvent<EventMap>[] = []
    // Only use wildcards for string event keys
    if (typeof event === "string") {
      const wildcards = this.groups.get("*")
      if (wildcards && wildcards.size > 0) results.push(...wildcards)
    }
    const group = this.groups.get(event)
    if (group && group.size > 0) results.push(...group)
    return results
  }

  /**
   * Get only listeners for a specific event or wildcard.
   * Pass "*" to get wildcards, or an event name for event-specific listeners.
   */
  /**
   * Get only listeners for a specific event or wildcard group.
   * Pass "*" (string) to get wildcards, or an event key (string or symbol) for event-specific listeners.
   */
  public get<EventName extends EmitterEventKey<EventMap> | "*">(
    event: EventName,
  ): RegisteredListenerForAnyEvent<EventMap>[] {
    return Array.from(this.groups.get(event) || [])
  }

  /**
   * Remove all listeners from all groups.
   */
  public clear(): void {
    this.groups.clear()
  }
}

// class FilterGroupRegistry {

//   /**
//    * Remove all listeners from all groups.
//    */
//   clear() {
//     this.groups.clear()
//   }

//   /**
//    * Count listeners in a group (event or wildcard).
//    * If no key is provided, returns total across all groups.
//    */
//   count<EventName extends EmitterEventKey<EventMap> | "*">(
//     key?: EventName
//   ): number {
//     if (key !== undefined) {
//       return this.groups.get(key)?.size ?? 0
//     }
//     let total = 0
//     for (const group of this.groups.values()) {
//       total += group.size
//     }
//     return total
//   }
// }

// === Helpers ===

export function brandPriorityLinkedList<T>(list: LinkedList<T>): PriorityLinkedList<T> {
  if ((list as { __brand?: unknown }).__brand === PRIORITY_LINKED_LIST_BRAND) {
    return list as PriorityLinkedList<T>
  }

  Object.defineProperty(list, "__brand", {
    value: PRIORITY_LINKED_LIST_BRAND,
    writable: false,
    enumerable: false,
    configurable: false,
  })

  return list as PriorityLinkedList<T>
}

export function isPriorityLinkedList<T>(list: LinkedList<T>): list is PriorityLinkedList<T> {
  return (
    Object.prototype.hasOwnProperty.call(list, "__brand") &&
    (list as { __brand?: unknown }).__brand === PRIORITY_LINKED_LIST_BRAND
  )
}

export function assertPriorityLinkedList<T>(
  list: LinkedList<T>,
): asserts list is PriorityLinkedList<T> {
  if (DEV_MODE && !isPriorityLinkedList(list)) {
    throw new BaseError(
      "Expected a PriorityLinkedList: the provided list is not branded correctly.",
      {
        metadata: {
          receivedType: Object.prototype.toString.call(list),
          hasBrand: Object.prototype.hasOwnProperty.call(list, "__brand"),
          brandValue: (list as { __brand?: unknown }).__brand,
        },
      },
    )
  }
}
