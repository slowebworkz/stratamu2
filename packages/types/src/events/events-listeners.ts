import type { BaseEventMap, EventListenerFn, EventKeyType, KnownEventKey } from "./index.ts"

/**
 * Array of listener functions for a single event key
 */
export type EventListenersForKey<Args extends unknown[]> = Array<EventListenerFn<Args>>

/**
 * Internal storage type for all listeners in the Events class
 */
export type EventsListeners<EventMap extends BaseEventMap> = {
  [K in KnownEventKey<EventMap>]?: EventListenersForKey<EventMap[K]>
}
