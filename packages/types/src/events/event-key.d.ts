// Emittery uses PropertyKey (string | symbol | number) for event names
export type EventKeyType = string | symbol

/**
 * Extracts the known event keys (string or symbol) from a given event map.
 */
export type KnownEventKey<EventMap> = Extract<keyof EventMap, EventKeyType>

// EventKey: all known string and symbol keys, plus any string
export type EventKey<T> = Extract<keyof T, string | symbol> | string
