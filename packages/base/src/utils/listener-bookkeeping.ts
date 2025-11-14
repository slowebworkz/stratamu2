/**
 * Listener bookkeeping utilities for event systems.
 * Provides generic helpers for mapping original listeners to wrapped listeners,
 * cleaning up empty maps, and aggregating listener counts.
 */

export type ListenerMap<EventName = string, Original = Function, Wrapped = Function> = Map<
  EventName,
  Map<Original, Wrapped>
>

export type ListenerMapWeak<
  EventName = string | symbol,
  Original extends object = object,
  Wrapped = Function,
> = Map<EventName, WeakMap<Original, Wrapped>>

type AnyMapLike<K, V> = Map<K, V> | WeakMap<K extends object ? K : never, V>

/** Create a new listener bookkeeping map. */
export function createListenerMap<
  EventName = string,
  Original = Function,
  Wrapped = Function,
>(): ListenerMap<EventName, Original, Wrapped> {
  return new Map()
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
  const subMap = getOrCreateSubMap(map, event, () => new Map<Original, Wrapped>())
  subMap.set(original, wrapped)
}

/**
 * Remove a mapping for a given event and original listener.
 * Cleans up the sub-map if it becomes empty.
 */
export function removeListenerMapping<EventName, Original, Wrapped>(
  map: ListenerMap<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
): void {
  removeMappingCommon(map, event, original)
}

/** Remove all listener mappings. */
export function clearAllListenerMappings<EventName, Original, Wrapped>(
  map: ListenerMap<EventName, Original, Wrapped>,
): void {
  clearAllCommon(map)
}

/** Get the wrapped listener for a given event and original listener. */
export function getWrappedListener<EventName, Original, Wrapped>(
  map: ListenerMap<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
): Wrapped | undefined {
  return getWrapped(map, event, original)
}

/** Get listener counts per event and total, preserving key fidelity. */
export function getListenerCounts<EventName, Original, Wrapped>(
  map: ListenerMap<EventName, Original, Wrapped>,
): { perEvent: Map<EventName, number>; total: number } {
  const perEvent = new Map<EventName, number>()
  let total = 0
  for (const [event, subMap] of map.entries()) {
    const count = subMap.size
    perEvent.set(event, count)
    total += count
  }
  return { perEvent, total }
}

/** Check if a mapping exists for a given event and original listener. */
export function hasListener<EventName, Original, Wrapped>(
  map: ListenerMap<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
): boolean {
  return hasListenerCommon(map, event, original)
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
  return new Map()
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
  const subMap = getOrCreateSubMap(map, event, () => _newWeakMap<Original, Wrapped>())
  subMap.set(original, wrapped)
}

/**
 * Remove a mapping for a given event and original listener (WeakMap version).
 * Cleans up the sub-map if it becomes empty (cannot check WeakMap size, so only deletes event if subMap is empty on creation).
 */
export function removeListenerMappingWeak<EventName, Original extends object, Wrapped>(
  map: ListenerMapWeak<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
): void {
  const subMap = map.get(event)
  if (subMap) {
    subMap.delete(original)
    // WeakMap has no size property, so we cannot clean up empty sub-maps
  }
}

/** Remove all listener mappings (WeakMap version). */
export function clearAllListenerMappingsWeak<EventName, Original extends object, Wrapped>(
  map: ListenerMapWeak<EventName, Original, Wrapped>,
): void {
  clearAllCommon(map)
}

/** Get the wrapped listener for a given event and original listener (WeakMap version). */
export function getWrappedListenerWeak<EventName, Original extends object, Wrapped>(
  map: ListenerMapWeak<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
): Wrapped | undefined {
  const subMap = map.get(event)
  return subMap ? subMap.get(original) : undefined
}

/** Check if a mapping exists for a given event and original listener (WeakMap version). */
export function hasListenerWeak<EventName, Original extends object, Wrapped>(
  map: ListenerMapWeak<EventName, Original, Wrapped>,
  event: EventName,
  original: Original,
): boolean {
  return map.get(event)?.has(original) ?? false
}

/** Common helper to get or create a sub-map (Map or WeakMap) */
function getOrCreateSubMap<
  EventName,
  Original,
  Wrapped,
  SubMap extends AnyMapLike<Original, Wrapped>,
>(map: Map<EventName, SubMap>, event: EventName, createSubMap: () => SubMap): SubMap {
  let subMap = map.get(event)
  if (!subMap) {
    subMap = createSubMap()
    map.set(event, subMap)
  }
  return subMap
}

/** Common helper to get a wrapped listener */
function getWrapped<Original, Wrapped, SubMap extends Map<Original, Wrapped>>(
  map: Map<any, SubMap>,
  event: any,
  original: Original,
): Wrapped | undefined {
  return map.get(event)?.get(original)
}

/** Common helper to check existence */
function hasListenerCommon<Original, SubMap extends Map<Original, any>>(
  map: Map<any, SubMap>,
  event: any,
  original: Original,
): boolean {
  return map.get(event)?.has(original) ?? false
}

/** Common remove helper for standard Map (with .size check) */
function removeMappingCommon<EventName, Original, Wrapped>(
  map: Map<EventName, Map<Original, Wrapped>>,
  event: EventName,
  original: Original,
): void {
  const subMap = map.get(event)
  if (subMap) {
    subMap.delete(original)
    if (subMap.size === 0) map.delete(event)
  }
}

/** Common clear helper */
function clearAllCommon(map: Map<any, any>): void {
  map.clear()
}

// Internal helper for creating a WeakMap
function _newWeakMap<Original extends object, Wrapped>() {
  return new WeakMap<Original, Wrapped>()
}
