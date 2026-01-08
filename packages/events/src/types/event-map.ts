import type { Merge, ReadonlyDeep } from "type-fest"
import type { EventKeyType, KnownEventKey, EventKey } from "./index.ts"
import type { BaseEventMap } from "@repo/types"

/**
 * Single event name or a readonly list of event names.
 * Supports known keys + arbitrary strings.
 */
export type EventName<EventMap extends BaseEventMap = BaseEventMap> =
  | EventKey<EventMap>
  | readonly EventKey<EventMap>[]

/**
 * Combines a user event map with omnipresent/system events for type-safe APIs.
 * Merges two event maps while preserving type safety.
 */
export type FullEventMap<
  EventMap extends BaseEventMap = BaseEventMap,
  Omnipresent extends BaseEventMap = BaseEventMap,
> = Merge<EventMap, ReadonlyDeep<Omnipresent>>

/**
 * Extracts all valid event names from the merged full event map.
 */
export type FullEventName<
  EventMap extends BaseEventMap = BaseEventMap,
  Omnipresent extends BaseEventMap = BaseEventMap,
> = EventKey<FullEventMap<EventMap, Omnipresent>>
