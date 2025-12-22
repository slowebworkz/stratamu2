import type { BaseEventMap } from "@/events"
import type { Merge, ReadonlyDeep } from "type-fest"

/**
 * Combines a user event map with omnipresent/system events for type-safe APIs.
 *
 * Note: By default, Omnipresent should be Emittery's OmnipresentEventData for
 * full compatibility, but it's kept generic to allow custom system events.
 */
export type FullEventMap<
  EventMap extends BaseEventMap = BaseEventMap,
  Omnipresent extends BaseEventMap = BaseEventMap,
> = Merge<EventMap, ReadonlyDeep<Omnipresent>>
