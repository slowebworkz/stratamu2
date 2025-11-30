import type { BaseEventMap, EventKey, EventListenerFn } from "./index.ts"

/**
 * Strongly-typed listener function for any event in the given event map.
 *
 * - Represents a listener for any event key in the map.
 * - Use this type for APIs that accept a generic event listener, regardless of event name.
 * - For a specific event, use `EventListenerFn<EventMap[SomeKey]>` directly.
 *
 * @template EventMap - The event map type (must have array values)
 */
export type EventListener<
  EventMap extends BaseEventMap = BaseEventMap,
  Name extends EventKey<EventMap> = EventKey<EventMap>,
> = EventListenerFn<EventMap[Name]>
