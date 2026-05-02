import type { Awaitable, BaseEventMap } from "@repo/types"
import type { Simplify } from "type-fest"
import type { EventKey } from "./index.ts"

/**
 * Base event listener function type.
 * Accepts event data as a single argument (Emittery-compatible).
 */
export type EventListenerFn<T> = (eventData: T) => Awaitable<void>

/**
 * Adapter: wrap a spread-args listener to single-arg listener (for tuples).
 */
export type ToSingleArgListener<T extends unknown[]> = EventListenerFn<T>

/**
 * Adapter: wrap a single-arg listener to spread-args listener (for tuple unpacking).
 */
export type ToSpreadArgsListener<T extends unknown[]> = (...args: T) => Awaitable<void>

/**
 * Strongly-typed listener function for a given event.
 * Receives event payload(s) as arguments spread from the event map array.
 * Returns void (listeners don't return meaningful values).
 */
export type ListenerFn<
  EventMap extends BaseEventMap = BaseEventMap,
  EventKey extends keyof EventMap = keyof EventMap,
> = Simplify<(...args: EventMap[EventKey]) => Awaitable<void>>

/**
 * A listener that receives a single argument (the event payload).
 * Wraps EventMap[EventKey] as a single argument instead of spread args.
 * Returns void (listeners don't return meaningful values).
 */
export type SingleArgListener<
  EventMap extends BaseEventMap = BaseEventMap,
  EventKey extends keyof EventMap = keyof EventMap,
> = Simplify<(data: EventMap[EventKey]) => Awaitable<void>>

/**
 * Strongly-typed listener function for any event in the given event map.
 * Use for APIs that accept a generic event listener, regardless of event name.
 */
export type EventListener<
  EventMap extends BaseEventMap = BaseEventMap,
  Name extends EventKey<EventMap> = EventKey<EventMap>,
> = EventListenerFn<EventMap[Name]>

/**
 * Listener for a single-payload event.
 * Accepts the event payload as a single argument.
 */
export type Listener<
  EventMap extends BaseEventMap = BaseEventMap,
  Name extends EventKey<EventMap> = EventKey<EventMap>,
> = ListenerFn<{ [K in Name]: [EventMap[K]] }, Name>

/**
 * Full event listener that accepts any event from the event map.
 */
export type FullEventListener<
  EventMap extends BaseEventMap = BaseEventMap,
  Name extends EventKey<EventMap> = EventKey<EventMap>,
> = EventListenerFn<EventMap[Name]>

/**
 * Any listener function type - generic over payload type for flexibility.
 * Accepts a single argument of any type.
 * Returns void (listeners don't return meaningful values).
 */
export type AnyListener<T = unknown> = (data: T) => Awaitable<void>

/**
 * Any listener function (non-awaitable variant) - derives from AnyListener.
 * Since `unknown` is assignable to `Awaitable<unknown>`, this is compatible with AnyListener.
 */
export type AnyListenerFn<T = unknown> = (data: T) => unknown

/**
 * Map of all listeners for all events in an event map.
 * Arrays are readonly to signal internal immutability and prevent accidental mutation.
 */
export type EventsListeners<EventMap extends BaseEventMap = BaseEventMap> = {
  [K in keyof EventMap]?: readonly ListenerFn<EventMap, K>[]
}
