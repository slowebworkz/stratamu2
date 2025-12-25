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
  private readonly keysCache = new Map<
    RegistryKey,
    ReadonlyArray<SingleArgListener<EventMap, RegistryKey>>
  >()

  /** Cached wrapped listeners per original listener per event (WeakMap avoids memory leaks) */
  private getCache: ListenerEventCache<EventMap, WrappedListener> = new WeakMap()

  /* --------- Protected Methods for Cache --------- */

  /** Invalidate the readonly Set cache for a specific event */
  protected invalidateCache<E extends RegistryKey>(event?: E): void {
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
  public get<E extends RegistryKey>(
    event: E,
    original: SingleArgListener<EventMap, E>,
  ): WrappedListener | undefined {
    const perEventCache = this.getPerEventCache<E>(original)
    return this.memoize(event, perEventCache, () => {
      const map = this.getMapIfExists(event)
      return map?.get(original)
    })
  }

  /** Retrieve all wrapped listeners for a given event (cached) */
  public getAll<E extends RegistryKey>(event: E): ReadonlyArray<WrappedListener> {
    return this.memoize(event, this.wrappedCache, () => {
      const map = this.getMapForEvent(event)
      return ListenerWrapperRegistry.valuesArray(map) as ReadonlyArray<WrappedListener>
    })
  }

  /** Iterables: iterate wrapped listeners without allocating an array */
  public *getAllIterable<E extends RegistryKey>(event: E): Iterable<WrappedListener> {
    const map = this.getMapIfExists(event)
    if (map) yield* map.values()
  }

  /** Retrieve all original listeners for a given event (cached) */
  public keys<E extends RegistryKey>(event: E): ReadonlyArray<SingleArgListener<EventMap, E>> {
    return this.memoize(
      event,
      this.keysCache,
      () =>
        ListenerWrapperRegistry.keysArray(this.registry.get(event)) as ReadonlyArray<
          SingleArgListener<EventMap, E>
        >,
    )
  }

  /** Iterate all original listeners for a given event */
  public *keysIterable<E extends RegistryKey>(event: E): Iterable<SingleArgListener<EventMap, E>> {
    const map = this.getMapIfExists(event)
    if (map) yield* map.keys()
  }

  /** Check if a wrapped listener exists for an original listener */
  public has<E extends RegistryKey>(event: E, original: SingleArgListener<EventMap, E>): boolean {
    const map = this.getMapIfExists(event)
    return map?.has(original) ?? false
  }

  /** Retrieve the wrapped listener or throw if not found */
  public getOrThrow<E extends RegistryKey>(
    event: E,
    original: SingleArgListener<EventMap, E>,
  ): WrappedListener {
    const map = this.registry.get(event) as
      | Map<SingleArgListener<EventMap, E>, WrappedListener>
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
    wrapped: WrappedListener
  ): void {
    const map = this.ensureMap(event)
    map.set(original, wrapped)
    this.invalidateCache(event)
  }


  /* ------------------- Private helpers ------------------- */

  /** Get or create per-event cache for a listener (generic for type safety) */
  private getPerEventCache<E extends RegistryKey>(
    original: SingleArgListener<EventMap, E>,
  ): PerEventCache<EventMap, WrappedListener> {
    // Isolate the cast to this method only
    let cache = this.getCache.get(original as unknown as AnyEventListener<EventMap>)
    if (!cache) {
      cache = new Map()
      this.getCache.set(original as unknown as AnyEventListener<EventMap>, cache)
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

  /** Get keys iterable for an event, with empty fallback */
  private getKeysIterable<E extends RegistryKey>(
    event: E,
  ): Iterable<SingleArgListener<EventMap, E>> {
    return (
      (this.getMapIfExists(event)?.keys() as
        | Iterable<SingleArgListener<EventMap, E>>
        | undefined) ?? ListenerWrapperRegistry.emptyIterable()
    )
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


  /** Get an existing map or create a new one if it doesn't exist */
  private ensureMap(event: RegistryKey): Map<SingleArgListener<EventMap, RegistryKey>, WrappedListener> {
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
