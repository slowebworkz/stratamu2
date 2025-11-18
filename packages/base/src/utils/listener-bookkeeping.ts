//
/**
 * Throws if the provided key is not valid for a WeakMap (not a function or plain object).
 * Only narrows type when subMap is a WeakMap.
 */
function assertValidWeakMapKey<Original, Wrapped>(
  subMap: AnyMapLike<Original, Wrapped>,
  key: unknown,
): asserts key is Extract<Original, object> {
  if (subMap instanceof WeakMap) {
    if (!isValidWeakMapKey(key)) {
      throw new TypeError("WeakMap keys must be non-null objects or functions");
    }
  }
}

/**
 * Returns true if the value is a valid WeakMap key (function or plain object).
 */
function isValidWeakMapKey(value: unknown): value is object | AnyListenerFn {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}


/**
 * Canonical type for any function signature (for event listeners, etc.)
 */
export type AnyListenerFn = (...args: unknown[]) => unknown;

/**
 * Listener bookkeeping utilities for event systems.
 * Provides generic helpers for mapping original listeners to wrapped listeners,
 * cleaning up empty maps, and aggregating listener counts.
 */


export type ListenerMap<
  EventName = string,
  Original = AnyListenerFn,
  Wrapped = AnyListenerFn
> = Map<EventName, Map<Original, Wrapped>>;


export type ListenerMapWeak<
  EventName = string | symbol,
  Original extends object = object,
  Wrapped = AnyListenerFn
> = Map<EventName, WeakMap<Original, Wrapped>>;

type AnyMapLike<Original, Wrapped> =
  | Map<Original, Wrapped>
  | WeakMap<Extract<Original, object>, Wrapped>;

/** Create a new listener bookkeeping map. */
export function createListenerMap<
  EventName = string,
  Original = AnyListenerFn,
  Wrapped = AnyListenerFn,
>(): ListenerMap<EventName, Original, Wrapped> {
  return new Map();
}

/**
 * Add a mapping from original to wrapped listener for a given event.
 * Creates the sub-map if it does not exist.
 */
export function addListenerMapping<EventName, Original, Wrapped>(
  map: ListenerMap<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
  wrapped: Wrapped,
): void {
  const subMap = getOrCreateSubMap(map, event, () => new Map<Original, Wrapped>());
  subMap.set(original, wrapped);
}

/**
 * Remove a mapping for a given event and original listener (Map or WeakMap version).
 * Cleans up the sub-map if it becomes empty (for Map only).
 */
export function removeListenerMapping<EventName, Original, Wrapped>(
  map: Map<EventName, AnyMapLike<Original, Wrapped>>,
  event: EventName,
  original: Original,
): void {
  removeEntry(map, event, original);
}

/** Remove all listener mappings. */
export function clearAllListenerMappings<EventName, Original, Wrapped>(
  map: ListenerMap<EventName, Original, Wrapped>,
): void {
  clearAllCommon(map);
}

/** Get the wrapped listener for a given event and original listener. */
export function getWrappedListener<EventName, Original, Wrapped>(
  map: ListenerMap<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
): Wrapped | undefined {
  return map.get(event)?.get(original);
}

/** Get listener counts per event and total, preserving key fidelity. */
export function getListenerCounts<EventName, Original, Wrapped>(
  map: ListenerMap<EventName, Original, Wrapped>,
): { perEvent: Map<EventName, number>; total: number } {
  const perEvent = new Map<EventName, number>();
  let total = 0;
  for (const [event, subMap] of map.entries()) {
    const count = subMap.size;
    perEvent.set(event, count);
    total += count;
  }
  return { perEvent, total };
}

/** Check if a mapping exists for a given event and original listener. */
export function hasListener<EventName, Original, Wrapped>(
  map: ListenerMap<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
): boolean {
  return hasListenerCommon(map, event, original);
}

/**
 * Weak listener bookkeeping utilities for event systems.
 * Use when Original is always an object or function (not a primitive).
 */

/** Create a new weak listener bookkeeping map. */
export function createListenerMapWeak<
  EventName = string | symbol,
  Original extends object = object,
  Wrapped = Function,
>(): ListenerMapWeak<EventName, Original, Wrapped> {
  return new Map();
}

/**
 * Add a mapping from original to wrapped listener for a given event (WeakMap version).
 * Creates the sub-map if it does not exist.
 */
export function addListenerMappingWeak<EventName, Original extends object, Wrapped>(
  map: ListenerMapWeak<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
  wrapped: Wrapped,
): void {
  const subMap = getOrCreateSubMap(map, event, () => new WeakMap<Original, Wrapped>());
  subMap.set(original, wrapped);
}

/**
 * Remove a mapping for a given event and original listener (WeakMap version).
 * Cleans up the sub-map if it becomes empty (cannot check WeakMap size, so only deletes event if subMap is empty on creation).
 */

/** Remove all listener mappings (WeakMap version). */
export function clearAllListenerMappingsWeak<EventName, Original extends object, Wrapped>(
  map: ListenerMapWeak<EventName, Original, Wrapped>,
): void {
  clearAllCommon(map);
}

/** Get the wrapped listener for a given event and original listener (WeakMap version). */
export function getWrappedListenerWeak<EventName, Original extends object, Wrapped>(
  map: ListenerMapWeak<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
): Wrapped | undefined {
  // Type constraint ensures only objects/functions are used as keys; no cast or runtime check needed
  return map.get(event)?.get(original);
}

/** Check if a mapping exists for a given event and original listener (WeakMap version). */
export function hasListenerWeak<EventName, Original extends object, Wrapped>(
  map: ListenerMapWeak<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
): boolean {
  // Type constraint ensures only objects/functions are used as keys; no cast or runtime check needed
  return map.get(event)?.has(original) ?? false;
}

/** Common helper to get or create a sub-map (Map or WeakMap) */
function getOrCreateSubMap<
  EventName,
  Original,
  Wrapped,
  SubMap extends AnyMapLike<Original, Wrapped>,
>(map: Map<EventName, SubMap>, event: EventName, createSubMap: () => SubMap): SubMap {
  let subMap = map.get(event);
  if (!subMap) {
    subMap = createSubMap();
    map.set(event, subMap);
  }
  return subMap;
}

/** Common helper to check existence (Map or WeakMap) */
function hasListenerCommon<Original, Wrapped>(
  map: Map<any, AnyMapLike<Original, Wrapped>>,
  event: any,
  original: unknown,
): boolean {
  const subMap = map.get(event);
  if (!subMap) return false;
  assertValidWeakMapKey<Original, Wrapped>(subMap, original);
  return subMap.has(original);
}

/** Unified remove helper for Map and WeakMap sub-maps */
function removeEntry<EventName, Original, Wrapped>(
  map: Map<EventName, AnyMapLike<Original, Wrapped>>,
  event: EventName,
  original: Original,
): void {
  const subMap = map.get(event);
  if (!subMap) return;
  assertValidWeakMapKey<Original, Wrapped>(subMap, original);
  subMap.delete(original);
  // Note: For Map sub-maps, we can remove the event key if the sub-map is empty.
  // For WeakMap sub-maps, JavaScript does not provide a way to check if the WeakMap is empty,
  // so the event key may remain in the main map even if the WeakMap is empty. This is not a significant
  // memory leak, as WeakMap entries are garbage collected when their keys are unreachable.
  if (subMap instanceof Map && subMap.size === 0) {
    map.delete(event);
  }
}

/** Common clear helper */
function clearAllCommon(map: Map<any, any>): void {
  map.clear();
}
