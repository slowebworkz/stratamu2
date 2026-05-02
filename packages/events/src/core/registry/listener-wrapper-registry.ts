import type { AllEventKeys } from "@repo/events"
import { RegistryBase } from "@repo/events"
import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { Simplify } from "type-fest"
import {
  ListenerGetCache,
  ListenerKeysCache,
  ListenerWrappedCache,
  ListenerWrapperMemo,
} from "../cache/index.ts"
import { BaseError } from "@repo/base"

type ListenerMap<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap>,
  OriginalListener extends SingleArgListener<EventMap, RegistryKey> = SingleArgListener<
    EventMap,
    RegistryKey
  >,
  WrappedListener extends SingleArgListener<EventMap, RegistryKey> = SingleArgListener<
    EventMap,
    RegistryKey
  >,
> = Simplify<Map<OriginalListener, WrappedListener>>

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
> extends RegistryBase {
  /* -------------- 🔒 Protected Storage --------------------- */

  protected readonly registry = new Map<RegistryKey, ListenerMap<EventMap, RegistryKey>>()

  /* -------------- 🔒 Private Storage ----------------------- */

  /** Memoization cache for identity-preserving wrapped listeners */
  private readonly wrapperMemo = new ListenerWrapperMemo<EventMap, RegistryKey>()

  /**
   * Per-event cache: event key → readonly array of all wrapped listeners for that event.
   * Used to quickly return all listeners for a given event (getAll, values).
   * Cleared/invaildated on any mutation for that event.
   */
  private readonly wrappedCache = new ListenerWrappedCache<EventMap, RegistryKey>()

  /** Cached arrays of original listeners for keys() */
  private readonly keysCache = new ListenerKeysCache<EventMap, RegistryKey>()

  /**
   * Per-original per-event cache: original listener → (event key → wrapped listener).
   * Used for fast lookup of a wrapped listener for a specific original+event pair (get).
   * WeakMap ensures no memory leaks from original listeners.
   */
  private getCache = new ListenerGetCache<EventMap, RegistryKey>()

  /* -------------- 🛡️ Protected Methods -------------------- */

  /** Invalidate the readonly Set cache for a specific event */
  protected invalidateCache(event?: RegistryKey): void {
    if (event !== undefined) {
      this.wrappedCache.invalidate(event)
      this.keysCache.invalidate(event)
    } else {
      this.wrappedCache.clear()
      this.keysCache.clear()
    }

    // WeakMap cannot be partially invalidated; clear entire cache for correctness
    this.getCache.clearAll()
  }

  protected computeTotalCount(): number {
    let count = 0
    for (const map of this.registry.values()) {
      count += map.size
    }
    return count
  }

  /* -------------- 📤 Public Accessors --------------------- */

  /** Retrieve the wrapped listener for a given original listener (cached per event) */
  public get(
    event: RegistryKey,
    original: SingleArgListener<EventMap, RegistryKey>,
  ): SingleArgListener<EventMap, RegistryKey> | undefined {
    return this.getCache.memoize(original, event, () => {
      const map = this.getMapForEvent(event)
      if (!map) return undefined

      return this.getWrappedFromMemoOrMap(original, map)
    })
  }

  /** Retrieve all wrapped listeners for a given event (cached) */
  public getAll(event: RegistryKey): ReadonlyArray<SingleArgListener<EventMap, RegistryKey>> {
    return this.wrappedCache.getOrCompute(event, () => {
      const results = [] as SingleArgListener<EventMap, RegistryKey>[]

      const map = this.getMapForEvent(event)
      if (map) {
        for (const orig of map.keys()) {
          const wrapped = this.getWrappedFromMemoOrMap(orig, map)
          if (wrapped !== undefined) {
            results.push(wrapped)
          }
        }
      }

      return results
    })
  }

  /** Iterables: iterate wrapped listeners without allocating an array */
  public *getAllIterable(event: RegistryKey): Iterable<SingleArgListener<EventMap, RegistryKey>> {
    const map = this.getMapForEvent(event)
    if (!map) return

    for (const orig of map.keys()) {
      const wrapped = this.getWrappedFromMemoOrMap(orig, map)
      if (wrapped !== undefined) {
        yield wrapped
      }
    }
  }

  /** Retrieve all original listeners for a given event (cached) */
  /** Return the original listeners for a given event (no memoization/wrapping) */
  public keys(event: RegistryKey): ReadonlyArray<SingleArgListener<EventMap, RegistryKey>> {
    return this.keysCache.getOrCompute(event, () => {
      const results = [] as Array<SingleArgListener<EventMap, RegistryKey>>

      const map = this.registry.get(event)
      if (map) {
        for (const key of map.keys()) {
          if (typeof key !== "undefined") {
            results.push(key as SingleArgListener<EventMap, RegistryKey>)
          }
        }
      }

      return results
    })
  }

  /** Return the memoized/wrapped listeners for a given event (cached) */
  public values(event: RegistryKey): ReadonlyArray<SingleArgListener<EventMap, RegistryKey>> {
    return this.getAll(event)
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

  /**
   * Checks if a memoized wrapped listener exists for the given original listener and event.
   * This is faster than a full map lookup if you only care about the memoized wrapper.
   */
  public hasWrapped(
    event: RegistryKey,
    original: SingleArgListener<EventMap, RegistryKey>,
  ): boolean {
    // Only checks the memo, not the event map
    return this.wrapperMemo.get(original) !== undefined
  }

  /** Retrieve the wrapped listener or throw if not found */
  public getOrThrow(
    event: RegistryKey,
    original: SingleArgListener<EventMap, RegistryKey>,
  ): SingleArgListener<EventMap, RegistryKey> {
    const map = this.registry.get(event) as
      | Map<SingleArgListener<EventMap, RegistryKey>, SingleArgListener<EventMap, RegistryKey>>
      | undefined
    const wrapped = map?.get(original)
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

  /* -------------- ✏️ Public Mutators ---------------------- */

  /** Add a mapping of original listener → wrapped listener */
  public add(
    event: RegistryKey,
    original: SingleArgListener<EventMap, RegistryKey>,
    createWrapped: (
      original: SingleArgListener<EventMap, RegistryKey>,
    ) => SingleArgListener<EventMap, RegistryKey>,
  ): void {
    this.addToMapWithMemo(event, [original], createWrapped)
  }

  /** Add many mappings in a batch */
  public addAll(
    event: RegistryKey,
    listeners: Array<SingleArgListener<EventMap, RegistryKey>>,
    createWrapped: (
      original: SingleArgListener<EventMap, RegistryKey>,
    ) => SingleArgListener<EventMap, RegistryKey>,
  ): void {
    if (listeners.length === 0) return
    this.addToMapWithMemo(event, listeners, createWrapped)
  }

  /** DRY helper for adding listeners to map and memo */
  private addToMapWithMemo(
    event: RegistryKey,
    originals: Array<SingleArgListener<EventMap, RegistryKey>>,
    createWrapped: (
      original: SingleArgListener<EventMap, RegistryKey>,
    ) => SingleArgListener<EventMap, RegistryKey>,
  ): void {
    const map = this.ensureMap(event)
    for (const original of originals) {
      let wrapped = this.wrapperMemo.get(original)
      if (!wrapped) {
        wrapped = createWrapped(original)
        this.wrapperMemo.set(original, wrapped)
      }
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
    this.getCache.clearAll()
    this.markTotalDirty()
  }

  /* -------------- 📤 Public Queries ------------------------ */

  /** Get the number of listeners for a specific event */
  public getCount(event: RegistryKey): number {
    return this.registry.get(event)?.size ?? 0
  }

  /** Iterate over all original→wrapped listener pairs for a given event */
  public forEach(
    event: RegistryKey,
    callback: (
      original: SingleArgListener<EventMap, RegistryKey>,
      wrapped: SingleArgListener<EventMap, RegistryKey>,
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
      wrapped: SingleArgListener<EventMap, E>,
    ) => void,
  ): void {
    for (const [event, map] of this.registry) {
      // Type-safe iteration: the map's key type matches the event
      this.forEachInMap(event, map, callback)
    }
  }

  /** Type-safe helper for iterating a map with correct event typing */
  private forEachInMap<K extends RegistryKey>(
    event: K,
    map: Map<SingleArgListener<EventMap, K>, SingleArgListener<EventMap, K>>,
    callback: (
      evt: K,
      original: SingleArgListener<EventMap, K>,
      wrapped: SingleArgListener<EventMap, K>,
    ) => void,
  ): void {
    map.forEach((wrapped, original) => {
      callback(event, original, wrapped)
    })
  }

  /* -------------- 🔧 Private Helpers ---------------------- */

  /**
   * Get the internal map of original → wrapped listeners for a given event.
   * Returns `undefined` if no listeners are registered for that event.
   */
  private getMapForEvent(event: RegistryKey): ReturnType<typeof this.registry.get> {
    return this.registry.get(event)
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

    // Remove from wrapper memo as well to avoid memory leaks
    this.wrapperMemo.delete(original)

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

  /** DRY helper: get wrapped listener from memo or map */
  private getWrappedFromMemoOrMap(
    orig: SingleArgListener<EventMap, RegistryKey>,
    map: Map<SingleArgListener<EventMap, RegistryKey>, SingleArgListener<EventMap, RegistryKey>>,
  ): SingleArgListener<EventMap, RegistryKey> | undefined {
    return this.wrapperMemo.get(orig) ?? map.get(orig)
  }

  /* ---------------- Private static helpers ---------------- */

  /** Get an existing map or create a new one if it doesn't exist */
  private ensureMap(event: RegistryKey): NonNullable<ReturnType<typeof this.registry.get>> {
    let map = this.registry.get(event)
    if (!map) {
      map = ListenerWrapperRegistry.EMPTY_MAP<
        SingleArgListener<EventMap, RegistryKey>,
        SingleArgListener<EventMap, RegistryKey>
      >()

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

  /* -------------- 🗂️ Static/Shared Constants -------------- */

  /** Shared empty array to avoid repeated allocations for empty results */
  private static readonly EMPTY_ARRAY: ReadonlyArray<never> = []

  /**
   * Shared empty map for value field in protected registry.
   * Usage: ListenerWrapperRegistry.EMPTY_MAP<...>()
   */
  private static EMPTY_MAP<K, V>(): Map<K, V> {
    return new Map<K, V>()
  }
}
