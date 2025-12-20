import { BaseError } from "@/errors"
import type { BaseEventMap, EventKey } from "@repo/types"
import type {
  EventListener,
  WrapperMapFor,
  CachedOriginalListeners,
  ListenerEventCache,
} from "@/registry"

/* -------------------------------------------------------------------------- */
/*                        Listener Wrapper Registry                        */
/* -------------------------------------------------------------------------- */

/**
 * Registry for managing original → wrapped listener mappings with caching.
 *
 * Design principles:
 * - Lazy initialization of inner maps
 * - Cached readonly arrays for high-frequency queries
 * - Cache invalidation on mutations for consistency
 */

export class ListenerWrapperRegistry<EventMap extends BaseEventMap, WrappedListener> {
  /* =================== Static/Shared Constants =================== */
  /** Shared empty array to avoid repeated allocations for empty results */
  private static readonly EMPTY_ARRAY: ReadonlyArray<never> = []

  /* =================== Private Storage =================== */

  private readonly registry = new Map<
    EventKey<EventMap>,
    WrapperMapFor<EventMap, EventKey<EventMap>, WrappedListener>
  >()

  /** Cached arrays of wrapped listeners for getAll() */
  private readonly wrappedCache = new Map<EventKey<EventMap>, ReadonlyArray<WrappedListener>>()

  /** Cached arrays of original listeners for keys() */
  private readonly keysCache = new Map<EventKey<EventMap>, CachedOriginalListeners<EventMap>>()

  /** Cached wrapped listeners per original listener per event (WeakMap avoids memory leaks) */
  private getCache: ListenerEventCache<EventMap, WrappedListener> = new WeakMap()

  /** Cached total listener count */
  private _cachedTotalCount?: number
  private _totalCountDirty = true

  /* =================== Public Accessors =================== */

  /** Retrieve the wrapped listener for a given original listener (cached per event) */
  public get<E extends EventKey<EventMap>>(
    event: E,
    original: EventListener<EventMap, E>,
  ): WrappedListener | undefined {
    // Check WeakMap cache first (per-event lookup)
    const originalKey = original as EventListener<EventMap, EventKey<EventMap>>
    const perEventCache = this.getPerEventCache(originalKey)
    if (perEventCache.has(event)) {
      return perEventCache.get(event)
    }

    const map = this.getMapIfExists(event)
    const wrapped = map?.get(original)
    if (wrapped) {
      perEventCache.set(event, wrapped)
    }
    return wrapped
  }

  /** Retrieve all wrapped listeners for a given event (cached) */
  public getAll<E extends EventKey<EventMap>>(event: E): ReadonlyArray<WrappedListener> {
    return this.memoizeCache(this.wrappedCache, event, () =>
      ListenerWrapperRegistry.valuesArray(this.registry.get(event)),
    )
  }

  /** Iterables: iterate wrapped listeners without allocating an array */
  public *getAllIterable<E extends EventKey<EventMap>>(event: E): Iterable<WrappedListener> {
    yield* this.getValuesIterable(event)
  }

  /** Retrieve all original listeners for a given event (cached) */
  public keys<E extends EventKey<EventMap>>(event: E): ReadonlyArray<EventListener<EventMap, E>> {
    return this.memoizeCache(this.keysCache, event, () =>
      ListenerWrapperRegistry.keysArray(this.registry.get(event)),
    ) as ReadonlyArray<EventListener<EventMap, E>>
  }

  /** Iterables: iterate original listeners without allocating an array */
  public *keysIterable<E extends EventKey<EventMap>>(
    event: E,
  ): Iterable<EventListener<EventMap, E>> {
    yield* this.getKeysIterable(event)
  }

  /** Check if a wrapped listener exists for an original listener */
  public has<E extends EventKey<EventMap>>(
    event: E,
    original: EventListener<EventMap, E>,
  ): boolean {
    const map = this.getMapIfExists(event)
    return map?.has(original) ?? false
  }

  /** Retrieve the wrapped listener or throw if not found */
  public getOrThrow<E extends EventKey<EventMap>>(
    event: E,
    original: EventListener<EventMap, E>,
  ): WrappedListener {
    const map = this.registry.get(event)
    if (!map || !map.has(original as EventListener<EventMap, EventKey<EventMap>>)) {
      ListenerWrapperRegistry.throwError(
        "Wrapped listener not found for event",
        "WRAPPED_LISTENER_NOT_FOUND",
        event,
        original,
      )
    }
    const wrapped = map.get(original as EventListener<EventMap, EventKey<EventMap>>)
    if (wrapped === undefined) {
      ListenerWrapperRegistry.throwError(
        "Wrapped listener not found for event",
        "WRAPPED_LISTENER_NOT_FOUND",
        event,
        original,
      )
    }
    return wrapped
  }

  /* =================== Public Mutators =================== */

  /** Add a mapping of original listener → wrapped listener */
  public add<E extends EventKey<EventMap>>(
    event: E,
    original: EventListener<EventMap, E>,
    wrapped: WrappedListener,
  ): void {
    const map = ListenerWrapperRegistry.ensureMap(this, event)
    map.set(original as EventListener<EventMap, EventKey<EventMap>>, wrapped)
    this.markDirty(event)
  }

  /** Remove a listener mapping; returns true if removed */
  public delete<E extends EventKey<EventMap>>(
    event: E,
    original: EventListener<EventMap, E>,
  ): boolean {
    const map = this.getMapIfExists(event)
    if (!map) return false

    const removed = map.delete(original)

    // Cleanup and invalidate caches
    if (removed) {
      // Cleanup empty maps to prevent memory bloat
      if (map.size === 0) {
        this.registry.delete(event)
      }
      // Invalidate all caches
      const originalKey = original as EventListener<EventMap, EventKey<EventMap>>
      ListenerWrapperRegistry.invalidateCaches(this, event, originalKey)
    } else {
      this.markDirty(event)
    }

    return removed
  }

  /** Remove a listener mapping with validation; throws if not found */
  public deleteOrThrow<E extends EventKey<EventMap>>(
    event: E,
    original: EventListener<EventMap, E>,
  ): void {
    const map = this.registry.get(event)
    if (!map || !map.has(original as EventListener<EventMap, EventKey<EventMap>>)) {
      ListenerWrapperRegistry.throwError(
        "Cannot delete listener; mapping does not exist",
        "LISTENER_MAPPING_NOT_FOUND",
        event,
        original,
      )
    }
    map.delete(original as EventListener<EventMap, EventKey<EventMap>>)
    if (map.size === 0) this.registry.delete(event)

    // Invalidate all caches
    const originalKey = original as EventListener<EventMap, EventKey<EventMap>>
    ListenerWrapperRegistry.invalidateCaches(this, event, originalKey)
  }

  /** Add many mappings in a single batch and invalidate once */
  public addAll<E extends EventKey<EventMap>>(
    event: E,
    listeners: Array<[EventListener<EventMap, E>, WrappedListener]>,
  ): void {
    if (listeners.length === 0) return
    const map = ListenerWrapperRegistry.ensureMap(this, event)
    for (const [original, wrapped] of listeners) {
      map.set(original as EventListener<EventMap, EventKey<EventMap>>, wrapped)
    }
    this.markDirty(event)
  }

  /** Remove many mappings in a single batch and invalidate once */
  public deleteAll<E extends EventKey<EventMap>>(
    event: E,
    originals: Array<EventListener<EventMap, E>>,
  ): number {
    if (originals.length === 0) return 0
    const map = this.getMapIfExists(event)
    if (!map) return 0
    let removedCount = 0
    for (const original of originals) {
      if (map.delete(original)) {
        removedCount++
        // Invalidate WeakMap cache for this specific listener
        const originalKey = original as EventListener<EventMap, EventKey<EventMap>>
        ListenerWrapperRegistry.invalidateCaches(this, event, originalKey)
      }
    }
    if (map.size === 0) {
      this.registry.delete(event)
    }
    return removedCount
  }

  /** Clear all mappings */
  public clear(): void {
    this.registry.clear()
    this.getCache = new WeakMap()
    this.markDirty()
  }

  /* =================== Public Queries =================== */

  /** Get the number of listeners for a specific event */
  public getCount<E extends EventKey<EventMap>>(event: E): number {
    return this.registry.get(event)?.size ?? 0
  }

  /** Get total number of listeners across all events (memoized) */
  public totalCount(): number {
    if (!this._totalCountDirty && this._cachedTotalCount !== undefined) {
      return this._cachedTotalCount
    }

    let total = 0
    for (const map of this.registry.values()) {
      total += map.size
    }
    this._cachedTotalCount = total
    this._totalCountDirty = false
    return total
  }

  /** Iterate over all original→wrapped listener pairs for a given event */
  public forEach<E extends EventKey<EventMap>>(
    event: E,
    callback: (original: EventListener<EventMap, E>, wrapped: WrappedListener) => void,
  ): void {
    const map = this.registry.get(event)
    if (!map) return

    map.forEach((wrapped, original) => {
      callback(original as EventListener<EventMap, E>, wrapped)
    })
  }

  /** Iterate over all listeners across all events */
  public forEachAll(
    callback: <E extends EventKey<EventMap>>(
      event: E,
      original: EventListener<EventMap, E>,
      wrapped: WrappedListener,
    ) => void,
  ): void {
    for (const [event, map] of this.registry) {
      // Type-safe iteration: the map's key type matches the event
      this.forEachInMap(event as EventKey<EventMap>, map, callback)
    }
  }

  /** Type-safe helper for iterating a map with correct event typing */
  private forEachInMap<E extends EventKey<EventMap>>(
    event: E,
    map: WrapperMapFor<EventMap, E, WrappedListener>,
    callback: <K extends EventKey<EventMap>>(
      evt: K,
      original: EventListener<EventMap, K>,
      wrapped: WrappedListener,
    ) => void,
  ): void {
    map.forEach((wrapped, original) => {
      callback(event, original as EventListener<EventMap, E>, wrapped)
    })
  }

  /* =================== Private Helpers =================== */

  /** Generic memoization helper for per-event caches */
  private memoizeCache<K, V>(cache: Map<K, V>, key: K, compute: () => V): V {
    if (cache.has(key)) {
      const cached = cache.get(key)
      if (cached !== undefined) return cached
    }
    const value = compute()
    cache.set(key, value)
    return value
  }

  /** Mark caches dirty for a specific event or globally */
  private markDirty(event?: EventKey<EventMap>): void {
    if (event !== undefined) {
      this.wrappedCache.delete(event)
      this.keysCache.delete(event)
    } else {
      this.wrappedCache.clear()
      this.keysCache.clear()
    }
    this._totalCountDirty = true
  }

  /** Retrieve a map for an event if it exists, with proper typing */
  private getMapIfExists<E extends EventKey<EventMap>>(
    event: E,
  ): WrapperMapFor<EventMap, E, WrappedListener> | undefined {
    return this.registry.get(event) as WrapperMapFor<EventMap, E, WrappedListener> | undefined
  }

  /** Retrieve a map for an event, throwing if it doesn't exist */
  private getMapOrThrow<E extends EventKey<EventMap>>(
    event: E,
  ): WrapperMapFor<EventMap, E, WrappedListener> {
    const map = this.getMapIfExists(event)
    if (!map) {
      ListenerWrapperRegistry.throwError(
        "Listener map does not exist for event",
        "LISTENER_MAP_NOT_FOUND",
        event,
      )
    }
    return map
  }

  /** Get values iterable for an event, with empty fallback */
  private getValuesIterable<E extends EventKey<EventMap>>(event: E): Iterable<WrappedListener> {
    return this.getMapIfExists(event)?.values() ?? ListenerWrapperRegistry.emptyIterable()
  }

  /** Get keys iterable for an event, with empty fallback */
  private getKeysIterable<E extends EventKey<EventMap>>(
    event: E,
  ): Iterable<EventListener<EventMap, E>> {
    return (
      (this.getMapIfExists(event)?.keys() as Iterable<EventListener<EventMap, E>> | undefined) ??
      ListenerWrapperRegistry.emptyIterable()
    )
  }

  /** Get or create per-event cache for a listener */
  private getPerEventCache(
    original: EventListener<EventMap, EventKey<EventMap>>,
  ): Map<EventKey<EventMap>, WrappedListener> {
    let cache = this.getCache.get(original)
    if (!cache) {
      cache = new Map()
      this.getCache.set(original, cache)
    }
    return cache
  }

  /* =================== Private Static Helpers =================== */

  private static emptyIterable<T>(): Iterable<T> {
    return []
  }

  private static arrayFromIterator<T>(iter?: Iterable<T>): ReadonlyArray<T> {
    return iter
      ? (Array.from(iter) as ReadonlyArray<T>)
      : (ListenerWrapperRegistry.EMPTY_ARRAY as ReadonlyArray<T>)
  }

  private static valuesArray<V>(map?: Map<unknown, V>): ReadonlyArray<V> {
    return ListenerWrapperRegistry.arrayFromIterator(map?.values())
  }

  private static keysArray<K>(map?: Map<K, unknown>): ReadonlyArray<K> {
    return ListenerWrapperRegistry.arrayFromIterator(map?.keys())
  }

  /** Get an existing map or create a new one if it doesn't exist */
  private static ensureMap<EventMap extends BaseEventMap, WrappedListener>(
    registry: ListenerWrapperRegistry<EventMap, WrappedListener>,
    event: EventKey<EventMap>,
  ): WrapperMapFor<EventMap, EventKey<EventMap>, WrappedListener> {
    let map = registry.registry.get(event)
    if (!map) {
      map = new Map() as WrapperMapFor<EventMap, EventKey<EventMap>, WrappedListener>
      registry.registry.set(event, map)
    }
    return map
  }

  /** Unified cache invalidation helper */
  private static invalidateCaches<EventMap extends BaseEventMap, WrappedListener>(
    registry: ListenerWrapperRegistry<EventMap, WrappedListener>,
    event: EventKey<EventMap>,
    original?: EventListener<EventMap, EventKey<EventMap>>,
  ): void {
    if (original) {
      registry.getCache.get(original)?.delete(event)
    }
    registry.wrappedCache.delete(event)
    registry.keysCache.delete(event)
    registry._totalCountDirty = true
  }

  /** Unified error throwing helper */
  private static throwError<EventMap extends BaseEventMap>(
    message: string,
    code: string,
    event: EventKey<EventMap>,
    listener?: unknown,
  ): never {
    throw new BaseError(message, {
      code,
      category: "internal",
      metadata: { event: String(event), listener: listener?.toString() },
    })
  }
}
