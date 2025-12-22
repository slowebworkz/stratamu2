import type { BaseEventMap, EventKey, FullEventMap, Listener } from "./index.ts"

/**
 * Listener for a single-payload event on the full event map (user + omnipresent events).
 * Alias for Listener using FullEventMap.
 */
export type FullListener<
  EventMap extends BaseEventMap = BaseEventMap,
  Name extends EventKey<FullEventMap<EventMap>> = EventKey<FullEventMap<EventMap>>,
> = Listener<FullEventMap<EventMap>, Name>
