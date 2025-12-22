import type { BaseEventMap, EventKey } from "./index.ts"
import type { LiteralUnion } from "type-fest"

/**
 * Single event name or a readonly list of event names.
 * Uses EventKey so it supports known keys + arbitrary strings.
 */
export type EventName<EventMap extends BaseEventMap> =
  | LiteralUnion<EventKey<EventMap>, string>
  | readonly LiteralUnion<EventKey<EventMap>, string>[]
