import type { AllEventKeys } from "@/events"
import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { AnyEventListener, CachedOriginalListeners, ListenerEventCache, PerEventCache, WrapperMapFor } from "@/registry"
import { RegistryBase } from "./registry-base.ts"
import { BaseError } from "@/errors"

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
  /* --------------- Static/Shared Constants --------------- */
  /** Shared empty array to avoid repeated allocations for empty results */
  private static readonly EMPTY_ARRAY: ReadonlyArray<never> = []


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


  /* --------- Protected Methods for Cache --------- */

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

  protected computeTotalCount(): number {
    let count = 0
    for (const map of this.registry.values()) {
      count += map.size
    }
    return count
  }

  /* ------------------- Public Accessors ------------------- */

  /** Retrieve the wrapped listener for a given original listener (cached per event) */
  public get<E extends RegistryKey>(
    event: E,
    original: SingleArgListener<EventMap, E>,
  ): WrappedListener | undefined {
    const perEventCache = this.getPerEventCache(original as AnyEventListener<EventMap>)
    return this.memoize(event, perEventCache, () => {
      const map = this.getMapIfExists(event)
      return map?.get(original)
    })
  }

  /** Retrieve all wrapped listeners for a given event (cached) */
  public getAll<E extends RegistryKey>(
    event: E
  ): ReadonlyArray<WrappedListener> {
    return this.memoize(event, this.wrappedCache, () => {
      const map = this.getMapForEvent(event)
      return map ? Array.from(map.values()) as ReadonlyArray<WrappedListener> : []
    })
  }


  /* ------------------- Private helpers ------------------- */

  /** Get or create per-event cache for a listener */
  private getPerEventCache(
    original: AnyEventListener<EventMap>,
  ): PerEventCache<EventMap, WrappedListener> {
    let cache = this.getCache.get(original)
    if (!cache) {
      cache = new Map()
      this.getCache.set(original, cache)
    }
    return cache
  }


  /**
 * Get the internal map of original → wrapped listeners for a given event.
 * Returns `undefined` if no listeners are registered for that event.
 */
  private getMapForEvent(
    event: RegistryKey,
  ): Map<SingleArgListener<EventMap, RegistryKey>, WrappedListener> | undefined {
    return this.registry.get(event)
  }

  /**
   * Retrieve the map if it exists, typed as `WrapperMapFor` for convenience.
   */
  private getMapIfExists<E extends RegistryKey>(
    event: E,
  ): WrapperMapFor<EventMap, E, WrappedListener> | undefined {
    return this.getMapForEvent(event) as WrapperMapFor<EventMap, E, WrappedListener> | undefined
  }

  /* ---------------- Private static helpers ---------------- */

  private static emptyIterable<T>(): Iterable<T> {
    return []
  }

  private static arrayFromIterator<T>(iter?: Iterable<T>): ReadonlyArray<T> {
    return iter
      ? (Array.from(iter) as ReadonlyArray<T>)
      : (ListenerWrapperRegistry.EMPTY_ARRAY as ReadonlyArray<T>)
  }

  private static valuesArray<K, V>(map?: Map<K, V>): ReadonlyArray<V> {
    return ListenerWrapperRegistry.arrayFromIterator(map?.values())
  }

  private static keysArray<K>(map?: Map<K, unknown>): ReadonlyArray<K> {
    return ListenerWrapperRegistry.arrayFromIterator(map?.keys())
  }

  /** Get an existing map or create a new one if it doesn't exist */
  // private static ensureMap<EventMap extends BaseEventMap, WrappedListener>(
  //   registry: ListenerWrapperRegistry<EventMap, WrappedListener>,
  //   event: AllEventKeys<EventMap>,
  // ): WrapperMapFor<
  //   EventMap,
  //   AllEventKeys<EventMap>,
  //   WrappedListener,
  //   SingleArgListener<EventMap, AllEventKeys<EventMap>>
  // > {
  //   let map = registry.registry.get(event)
  //   if (!map) {
  //     map = new Map() as WrapperMapFor<
  //       EventMap,
  //       AllEventKeys<EventMap>,
  //       WrappedListener,
  //       SingleArgListener<EventMap, AllEventKeys<EventMap>>
  //     >
  //     registry.registry.set(event, map)
  //   }
  //   return map
  // }

  /** Unified error throwing helper */
  private static throwError<EventMap extends BaseEventMap>(
    message: string,
    code: string,
    event: AllEventKeys<EventMap>,
    listener?: unknown,
  ): never {
    throw new BaseError(message, {
      code,
      category: "internal",
      metadata: { event: String(event), listener: listener?.toString() },
    })
  }
}
