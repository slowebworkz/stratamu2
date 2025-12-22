import type { BaseEventMap, EventListenerFn, EventKeyType, KnownEventKey } from "./index.ts"

/**
 * Array of listener functions for a single event payload (single-arg shape)
 */
export type EventListenersForKey<Payload> = Array<EventListenerFn<Payload>>

/**
 * Alias for EventListenersForKey with clearer payload semantics
 * Use when payload is a value/tuple that will be handled as a single argument
 */
export type EventListenersForPayload<Payload> = EventListenersForKey<Payload>

/**
 * Internal storage type for all listeners in the Events class
 */
export type EventsListeners<EventMap extends BaseEventMap> = {
  [K in KnownEventKey<EventMap>]?: EventListenersForKey<EventMap[K]>
}
