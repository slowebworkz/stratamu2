/** Small module-level helpers used by emitters. */

/** Normalize a PropertyKey into a string key suitable for Map lookups. */
export function normalizeEventKey(k?: PropertyKey): string | undefined {
  if (k === undefined || k === null) return undefined
  return String(k)
}

/** Increment a numeric value stored in a Map<string, number> and return the new value. */
export function incrementCount(map: Map<string, number>, key: string, delta = 1): number {
  const next = (map.get(key) ?? 0) + delta
  map.set(key, next)
  return next
}

/** Shallow clone a map for safe outward returns. */
export function cloneMapShallow<K, V>(m: Map<K, V>): Map<K, V> {
  return new Map(m)
}

/** Sum numeric values in a map. */
export function sumMapValues(m: Map<any, number>): number {
  let total = 0
  for (const v of m.values()) total += v
  return total
}
