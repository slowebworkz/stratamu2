import type { AllEventKeys } from "@/events"
import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type {
  AnyEventListener,
  CachedOriginalListeners,
  ListenerEventCache,
  PerEventCache,
  WrapperMapFor,
} from "@/registry"
import { RegistryBase } from "./registry-base.ts"
import { BaseError } from "@/errors"

/* ------------------------------------------------------ */
/*              Listener Wrapper Registry                 */
/* ------------------------------------------------------ */

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

  protected readonly registry = new Map<
    RegistryKey,
    Map<SingleArgListener<EventMap, RegistryKey>, WrappedListener>
  >()

  /** Cached arrays of wrapped listeners for getAll() */
  private readonly wrappedCache = new Map<RegistryKey, ReadonlyArray<WrappedListener>>()

  /** Cached arrays of original listeners for keys() */
  private readonly keysCache = new Map<
    RegistryKey,
    ReadonlyArray<SingleArgListener<EventMap, RegistryKey>>
  >()

  /** Cached wrapped listeners per original listener per event (WeakMap avoids memory leaks) */
  private getCache: ListenerEventCache<EventMap, WrappedListener> = new WeakMap()

  /* --------- Protected Methods for Cache --------- */

  /** Invalidate the readonly Set cache for a specific event */
  protected invalidateCache(event?: RegistryKey): void {
    if (event !== undefined) {
      this.deleteFromCache(event, this.wrappedCache)
      this.deleteFromCache(event, this.keysCache)
      // WeakMap cannot be partially invalidated; clear entire cache for correctness
      this.getCache = new WeakMap()
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
  public get(
    event: RegistryKey,
    original: SingleArgListener<EventMap, RegistryKey>,
  ): WrappedListener | undefined {
    const perEventCache = this.getPerEventCache(original)
    return this.memoize(event, perEventCache, () => {
      const map = this.getMapForEvent(event)
      return map?.get(original)
    })
  }

  /** Retrieve all wrapped listeners for a given event (cached) */
  public getAll(event: RegistryKey): ReadonlyArray<WrappedListener> {
    return this.memoize(event, this.wrappedCache, () => {
      const map = this.getMapForEvent(event)
      return ListenerWrapperRegistry.valuesArray(map) as ReadonlyArray<WrappedListener>
    })
  }

  /** Iterables: iterate wrapped listeners without allocating an array */
  public *getAllIterable(event: RegistryKey): Iterable<WrappedListener> {
    const map = this.getMapForEvent(event)
    if (map) yield* map.values()
  }

  /** Retrieve all original listeners for a given event (cached) */
  public keys(event: RegistryKey): ReadonlyArray<SingleArgListener<EventMap, RegistryKey>> {
    return this.memoize(
      event,
      this.keysCache,
      () =>
        ListenerWrapperRegistry.keysArray(this.registry.get(event)) as ReadonlyArray<
          SingleArgListener<EventMap, RegistryKey>
        >,
    )
  }

  /** Iterate all original listeners for a given event */
  public *keysIterable(event: RegistryKey): Iterable<SingleArgListener<EventMap, RegistryKey>> {
    const map = this.getMapForEvent(event)
    if (map) yield* map.keys()
  }

  /** Check if a wrapped listener exists for an original listener */
  public has(event: RegistryKey, original: SingleArgListener<EventMap, RegistryKey>): boolean {
    const map = this.getMapForEvent(event)
    return map?.has(original) ?? false
  }

  /** Retrieve the wrapped listener or throw if not found */
  public getOrThrow(
    event: RegistryKey,
    original: SingleArgListener<EventMap, RegistryKey>,
  ): WrappedListener {
    const map = this.registry.get(event) as
      | Map<SingleArgListener<EventMap, RegistryKey>, WrappedListener>
      | undefined
    if (!map || !map.has(original)) {
      ListenerWrapperRegistry.throwError(
        "Wrapped listener not found for event",
        "WRAPPED_LISTENER_NOT_FOUND",
        event,
        original,
      )
    }
    const wrapped = map.get(original)
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

  /* ------------------- Public mutators ------------------- */

  /** Add a mapping of original listener → wrapped listener */
  public add(
    event: RegistryKey,
    original: SingleArgListener<EventMap, RegistryKey>,
    wrapped: WrappedListener,
  ): void {
    const map = this.ensureMap(event)
    map.set(original, wrapped)
    this.invalidateCache(event)
  }

  /** Add many mappings in a single batch and invalidate cache once */
  public addAll(
    event: RegistryKey,
    listeners: Array<[SingleArgListener<EventMap, RegistryKey>, WrappedListener]>,
  ): void {
    if (listeners.length === 0) return

    const map = this.ensureMap(event)
    for (const [original, wrapped] of listeners) {
      map.set(original, wrapped)
    }

    this.invalidateCache(event)
  }

  /** Remove a listener mapping; returns true if removed */
  public delete(event: RegistryKey, original: SingleArgListener<EventMap, RegistryKey>): boolean {
    return this.removeListener(event, original, false)
  }

  /** Remove many mappings in a single batch and invalidate once */
  public deleteAll(
    event: RegistryKey,
    originals: Array<SingleArgListener<EventMap, RegistryKey>>,
  ): number {
    if (originals.length === 0) return 0

    const map = this.getMapForEvent(event)
    if (!map) return 0

    let removedCount = 0
    for (const original of originals) {
      if (map.delete(original)) {
        removedCount++
      }
    }

    // Cleanup empty map
    if (map.size === 0) {
      this.registry.delete(event)
    }

    // Invalidate all caches once
    if (removedCount > 0) {
      this.invalidateCache(event)
    }

    return removedCount
  }

  /** Remove a listener mapping with validation; throws if not found */
  public deleteOrThrow(
    event: RegistryKey,
    original: SingleArgListener<EventMap, RegistryKey>,
  ): void {
    this.removeListener(event, original, true)
  }

  /** Clear all mappings */
  public clear(): void {
    this.registry.clear()
    this.getCache = new WeakMap()
    this.markTotalDirty()
  }

  /* ------------------- Public Queries ------------------- */

  /** Get the number of listeners for a specific event */
  public getCount(event: RegistryKey): number {
    return this.registry.get(event)?.size ?? 0
  }

  /** Iterate over all original→wrapped listener pairs for a given event */
  public forEach(
    event: RegistryKey,
    callback: (
      original: SingleArgListener<EventMap, RegistryKey>,
      wrapped: WrappedListener,
    ) => void,
  ): void {
    const map = this.registry.get(event)
    if (!map) return

    map.forEach((wrapped, original) => {
      callback(original, wrapped)
    })
  }

  /** Iterate over all listeners across all events */
  public forEachAll(
    callback: <E extends RegistryKey>(
      event: E,
      original: SingleArgListener<EventMap, E>,
      wrapped: WrappedListener,
    ) => void,
  ): void {
    for (const [event, map] of this.registry) {
      // Type-safe iteration: the map's key type matches the event
      this.forEachInMap(event, map, callback)
    }
  }

  /** Type-safe helper for iterating a map with correct event typing */
  private forEachInMap(
    event: RegistryKey,
    map: WrapperMapFor<
      EventMap,
      RegistryKey,
      WrappedListener,
      SingleArgListener<EventMap, RegistryKey>
    >,
    callback: <K extends RegistryKey>(
      evt: K,
      original: SingleArgListener<EventMap, K>,
      wrapped: WrappedListener,
    ) => void,
  ): void {
    map.forEach((wrapped, original) => {
      callback(event, original, wrapped)
    })
  }

  /* ------------------- Private helpers ------------------- */

  /** Utility to cast a listener to the WeakMap key type */
  private asListenerKey(
    listener: SingleArgListener<EventMap, RegistryKey>,
  ): AnyEventListener<EventMap> {
    return listener as unknown as AnyEventListener<EventMap>
  }

  /** Get or create per-event cache for a listener (generic for type safety) */
  private getPerEventCache(
    original: SingleArgListener<EventMap, RegistryKey>,
  ): PerEventCache<EventMap, WrappedListener> {
    let cache = this.getCache.get(this.asListenerKey(original))
    if (!cache) {
      cache = new Map()
      this.getCache.set(this.asListenerKey(original), cache)
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

  /** Get keys iterable for an event, with empty fallback */
  private getKeysIterable(event: RegistryKey): Iterable<SingleArgListener<EventMap, RegistryKey>> {
    return (
      (this.getMapForEvent(event)?.keys() as
        | Iterable<SingleArgListener<EventMap, RegistryKey>>
        | undefined) ?? ListenerWrapperRegistry.emptyIterable()
    )
  }

  /** Private helper to remove a listener and handle cleanup/invalidation */
  private removeListener(
    event: RegistryKey,
    original: SingleArgListener<EventMap, RegistryKey>,
    throwIfMissing = false,
  ): boolean {
    const map = this.getMapForEvent(event)
    if (!map) {
      if (throwIfMissing) {
        ListenerWrapperRegistry.throwError(
          "Cannot delete listener; mapping does not exist",
          "LISTENER_MAPPING_NOT_FOUND",
          event,
          original,
        )
      }
      return false
    }
    const existed = map.has(original)
    const removed = map.delete(original)
    if (existed && map.size === 0) {
      this.registry.delete(event)
    }
    if (removed) {
      this.invalidateCache(event)
    }
    if (throwIfMissing && !existed) {
      ListenerWrapperRegistry.throwError(
        "Cannot delete listener; mapping does not exist",
        "LISTENER_MAPPING_NOT_FOUND",
        event,
        original,
      )
    }
    return removed
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

  private static keysArray<K, V>(map?: Map<K, V>): ReadonlyArray<K> {
    return ListenerWrapperRegistry.arrayFromIterator(map?.keys())
  }

  /** Get an existing map or create a new one if it doesn't exist */
  private ensureMap(
    event: RegistryKey,
  ): Map<SingleArgListener<EventMap, RegistryKey>, WrappedListener> {
    let map = this.registry.get(event)
    if (!map) {
      map = new Map<SingleArgListener<EventMap, RegistryKey>, WrappedListener>()
      this.registry.set(event, map)
    }
    return map
  }

  /** Unified error throwing helper */
  private static throwError(
    message: string,
    code: ConstructorParameters<typeof BaseError>[1]["code"],
    event: PropertyKey,
    listener?: unknown,
  ): never {
    throw new BaseError(message, {
      code,
      category: "internal",
      metadata: {
        event: String(event),
        listener:
          typeof listener === "function"
            ? listener.name || "[anonymous listener]"
            : String(listener),
      },
    })
  }
}
