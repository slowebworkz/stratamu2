/**
 * Event keys restricted to string and symbol.
 * We exclude number (unlike PropertyKey) since numeric event names are uncommon.
 */
export type EventKeyType = string | symbol

/**
 * Extracts known event keys from an EventMap, restricted to string and symbol types.
 * Filters out any numeric keys that might exist in the object type.
 */
export type KnownEventKey<EventMap> = Extract<keyof EventMap, EventKeyType>

/**
 * Event keys: known keys from EventMap plus any arbitrary string.
 * Allows emitting events that aren't predefined in the type, useful for dynamic events.
 */
export type EventKey<T> = KnownEventKey<T> | string

/**
 * Emittable event keys including known events and any arbitrary string.
 * Alias for EventKey for semantic clarity.
 */
export type KnownAndArbitraryKey<T> = EventKey<T>
