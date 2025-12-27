type Sizable = { readonly size: number }

export abstract class RegistryBase {
  /* ------------------- Private Storage ------------------- */

  protected abstract readonly registry: Map<unknown, unknown>

  /** Cached total listener count */
  protected cachedTotalCount?: number

  protected totalCountDirty = true

  /* ----- Protected Methods for Cache & Dirty Tracking ----- */

  /** Mark the total listener count as dirty */
  protected markTotalDirty(): void {
    this.totalCountDirty = true
  }

  /**
   * Invalidate cache for a specific key or event.
   * Subclasses must implement to handle their own caches.
   */
  protected abstract invalidateCache(event?: unknown): void

  /** Generic helper: delete a key from one or more caches */
  protected deleteFromCache<K, V>(key: K, ...caches: Map<K, V>[]): void {
    for (const cache of caches) {
      cache.delete(key)
    }
  }

  /** Generic helper: clear one or more caches */
  protected clearCache<K, V>(...caches: Map<K, V>[]): void {
    for (const cache of caches) {
      cache.clear()
    }
  }

  protected memoize<K, V>(key: K, cache: Map<K, V>, compute: () => V): V {
    const existing = cache.get(key) as V | undefined
    if (existing !== undefined) return existing as V

    const value = compute()
    cache.set(key, value)
    return value
  }

  protected didMutate(event?: unknown): void {
    this.invalidateCache(event)
    this.markTotalDirty()
  }

  /* ------------------- Public Queries ------------------- */

  /** Get total number of listeners across all events */
  public get totalCount(): number {
    if (!this.totalCountDirty && this.cachedTotalCount !== undefined) {
      return this.cachedTotalCount
    }

    this.cachedTotalCount = this.computeTotalCount()
    this.totalCountDirty = false
    return this.cachedTotalCount
  }

  /**
   * Computes total count by summing `.size` on registry values.
   * Values may be Sets, Maps, or any size-bearing collection.
   */
  protected computeTotalCount(): number {
    let count = 0

    for (const value of this.registry.values()) {
      const sized = value as Partial<Sizable> | null
      if (typeof sized?.size === "number") {
        count += sized.size
      }
    }

    return count
  }
}
