/**
 * Base class for per-event caching.
 * Manages a Map of keys → frozen readonly arrays.
 */
export abstract class CacheBase<Key, Value> {
  /* --------------- Static/Shared Constants --------------- */

  /** Shared empty array to avoid repeated allocations for empty results */
  protected static readonly EMPTY_ARRAY: ReadonlyArray<never> = []

  /* ------------------- Private Storage ------------------- */

  protected readonly cache = new Map<Key, ReadonlyArray<Value>>()

  /* -------------- Public accessors/mutators -------------- */

  /** Get from cache or compute and store a frozen array */
  public getOrCompute(key: Key, compute: () => Array<Value>): ReadonlyArray<Value> {
    const existing = this.cache.get(key)
    if (existing) return existing

    const value = compute()
    const frozen = (
      value.length === 0
        ? (CacheBase.EMPTY_ARRAY as ReadonlyArray<Value>)
        : Object.freeze(value.slice())
    ) as ReadonlyArray<Value>

    this.cache.set(key, frozen)
    return frozen
  }

  /** Get cached value, or undefined */
  public get(key: Key): ReadonlyArray<Value> | undefined {
    return this.cache.get(key)
  }

  /** Invalidate a single key */
  public invalidate(key: Key): void {
    this.cache.delete(key)
  }

  /** Clear entire cache */
  public clear(): void {
    this.cache.clear()
  }
}
