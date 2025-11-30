import type { BaseEventMap } from "./index.ts"
import type { Merge, ReadonlyDeep } from "type-fest"

/**
 * Combines a user event map with omnipresent/system events for type-safe APIs.
 */
export type FullEventMap<
  EventMap extends BaseEventMap = BaseEventMap,
  Omnipresent extends BaseEventMap = BaseEventMap,
> = Merge<EventMap, ReadonlyDeep<Omnipresent>>
