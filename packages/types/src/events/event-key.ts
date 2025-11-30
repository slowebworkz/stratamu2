import type { LiteralUnion } from "type-fest"

export type EventKeyType = string | symbol

/**
 * Extracts the known event keys (string or symbol) from a given event map.
 */
export type KnownEventKey<EventMap> = Extract<keyof EventMap, EventKeyType>

export type EventKey<T> = LiteralUnion<KnownEventKey<T>, string>
