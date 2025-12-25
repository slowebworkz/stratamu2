import type { AllEventKeys } from "@/events"
import type { BaseEventMap } from "@repo/types"
import { NumberAbsolute } from "node_modules/type-fest/source/internal/numeric.js"

export abstract class RegistryBase {
  /* ------------------- Private Storage ------------------- */

  /** Cached total listener count */
  protected cachedTotalCount?: number

  protected totalCountDirty = true

  /* ----- Protected Methods for Cache & Dirty Tracking ----- */

  /** Mark the total listener count as dirty */
  protected markTotalDirty(): void {
    this.totalCountDirty = true
  }

  /**
   * Touch a cache for a specific event (or all caches if omitted)
   * and mark the total count as dirty.
   */
  protected touch(event?: unknown): void {
    if (event !== undefined) this.invalidateCache(event)
    this.markTotalDirty()
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

  /** Subclass must implement how to compute total listeners */
  protected abstract computeTotalCount(): number

  /** Get total number of listeners across all events */
  public get totalCount(): number {
    if (!this.totalCountDirty && this.cachedTotalCount !== undefined) {
      return this.cachedTotalCount
    }

    this.cachedTotalCount = this.computeTotalCount()
    this.totalCountDirty = false
    return this.cachedTotalCount
  }
}
