import type { BaseEventMap, EventKey, EventName, FullEventMap } from "./index.ts"

/**
 * Extracts all valid event names from the merged event map.
 */
export type FullEventName<
  EventMap extends BaseEventMap = BaseEventMap,
  Omnipresent extends BaseEventMap = BaseEventMap,
> = EventKey<FullEventMap<EventMap, Omnipresent>>
