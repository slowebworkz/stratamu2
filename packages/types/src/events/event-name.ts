import type { BaseEventMap, EventKey } from "./index.ts"

/**
 * Single event name or a readonly list of event names.
 * Uses EventKey so it supports known keys + arbitrary strings.
 */
export type EventName<EventMap extends BaseEventMap> =
  | EventKey<EventMap>
  | readonly EventKey<EventMap>[]
