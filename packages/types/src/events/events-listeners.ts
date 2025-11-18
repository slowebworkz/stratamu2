import type { BaseEventMap, EventListenerFn } from "./index.ts";

// Internal type for listeners storage in Events class
export type EventsListeners<EventMap extends BaseEventMap> = {
  [K in keyof EventMap]?: Array<EventListenerFn<EventMap[K]>>;
};
