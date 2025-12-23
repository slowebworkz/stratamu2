import type { AllEventKeys } from "@/events"
import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { CachedOriginalListeners, ListenerEventCache, PerEventCache, WrapperMapFor } from "@/registry"
import { RegistryBase } from "./registry-base.ts"

/* -------------------------------------------------------------------------- */
/*                        Listener Wrapper Registry                           */
/* -------------------------------------------------------------------------- */

/**
 * Registry for managing original → wrapped listener mappings with caching.
 *
 * Design principles:
 * - Lazy initialization of inner maps
 * - Cached readonly arrays for high-frequency queries
 * - Cache invalidation on mutations for consistency
 */

export class ListenerWrapperRegistry<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap> = AllEventKeys<EventMap>,
  WrappedListener extends SingleArgListener<EventMap, RegistryKey> = SingleArgListener<
    EventMap,
    RegistryKey
  >,
> extends RegistryBase {
  /* ------------------- Private Storage ------------------- */

  private readonly registry = new Map<
    RegistryKey,
    Map<SingleArgListener<EventMap, RegistryKey>, WrappedListener>
  >()

  /** Cached arrays of wrapped listeners for getAll() */
  private readonly wrappedCache = new Map<RegistryKey, ReadonlyArray<WrappedListener>>()

  /** Cached arrays of original listeners for keys() */
  private readonly keysCache = new Map<RegistryKey, CachedOriginalListeners<EventMap>>()

  /** Cached wrapped listeners per original listener per event (WeakMap avoids memory leaks) */
  private getCache: ListenerEventCache<EventMap, WrappedListener> = new WeakMap()

  /* ------- Private Methods for Cache & Dirty Tracking ------- */

  /** Invalidate the readonly Set cache for a specific event */
  protected invalidateCache<E extends RegistryKey>(event?: E): void {
    if (event !== undefined) {
      this.deleteFromCache(event, this.wrappedCache)
      this.deleteFromCache(event, this.keysCache)
      // optionally remove per-event entries from getCache WeakMap if needed
    } else {
      this.clearCache(this.wrappedCache)
      this.clearCache(this.keysCache)
      this.getCache = new WeakMap()
    }
  }

  /* ------------------- Public Accessors ------------------- */

  /** Retrieve the wrapped listener for a given original listener (cached per event) */
  public get<E extends RegistryKey>(
    event: E,
    original: SingleArgListener<EventMap, E>,
  ): WrappedListener | undefined {
    // Cast original listener to the broader type for WeakMap
    const originalKey = original as unknown as SingleArgListener<EventMap, AllEventKeys<EventMap>>
    const perEventCache = this.getPerEventCache(originalKey)

    return this.memoizeCache(event, perEventCache, () => {
      const map = this.getMapIfExists(event)
      return map?.get(original)
    })
  }



  protected computeTotalCount(): number {
    let count = 0
    for (const map of this.registry.values()) {
      count += map.size
    }
    return count
  }

  /* ------------------- Private helpers ------------------- */

  /** Get or create per-event cache for a listener */
  private getPerEventCache(
    original: SingleArgListener<EventMap, AllEventKeys<EventMap>>,
  ): PerEventCache<EventMap, WrappedListener> {
    let cache = this.getCache.get(original)
    if (!cache) {
      cache = new Map()
      this.getCache.set(original, cache)
    }
    return cache
  }





  private getMapIfExists<E extends RegistryKey>(event: E) {
    return this.getMap(this.registry, event) as WrapperMapFor<EventMap, E, WrappedListener> | undefined
  }



}
