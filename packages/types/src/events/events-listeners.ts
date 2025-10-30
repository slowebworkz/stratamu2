import type { BaseEventMap } from "./base-event-map.ts";
import type { EventListenerFn } from "./event-listener-fn.ts";

// Internal type for listeners storage in Events class
export type EventsListeners<EventMap extends BaseEventMap> = {
  [K in keyof EventMap]?: Array<EventListenerFn<EventMap[K]>>
}