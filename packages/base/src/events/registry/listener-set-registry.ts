import { BaseError } from "@/errors"
import type { BaseEventMap, EventKey } from "@repo/types"

/* ------------------- Internal Types ------------------- */

/** Set of wrapped listeners for a single event (internal storage) */
type EventListenerSetInternal<EventMap extends BaseEventMap, WrappedListener> = Set<WrappedListener>

/* -------------------------------------------------------------------------- */
/*                        Listener Set Registry                        */
/* -------------------------------------------------------------------------- */

/**
 * Registry for managing event listener sets with readonly public API and safe mutation helpers.
 *
 * Design principles:
 * - Internal sets are private and never exposed directly
 * - Public API returns ReadonlySet to prevent external mutations
 * - All mutations go through helper methods (add, delete, clear)
 * - Cache invalidation and dirty tracking ensure consistency in high-frequency game loops
 */
export class ListenerSetRegistry<EventMap extends BaseEventMap, WrappedListener> {
  /* =================== Private Storage =================== */

  /** Map of event → Set of wrapped listeners */
  private readonly sets = new Map<
    EventKey<EventMap>,
    EventListenerSetInternal<EventMap, WrappedListener>
  >()

  /** Cached ReadonlySet views for public consumption */
  private readonly readonlyCache = new Map<EventKey<EventMap>, ReadonlySet<WrappedListener>>()

  /** Cached total listener count */
  private _cachedTotalCount?: number
  private _totalCountDirty = true

  /* =================== Public Accessors =================== */

  /**
   * Get a readonly view of listeners for the given event.
   * Lazily creates a new set if none exists.
   */
  public get(event: EventKey<EventMap>): ReadonlySet<WrappedListener> {
    return ListenerSetRegistry.getReadonlySet(this, event)
  }

  /**
   * Require a readonly view of listeners for the given event.
   * Throws if no listeners exist for this event.
   */
  public require(event: EventKey<EventMap>): ReadonlySet<WrappedListener> {
    return this.requireSet(event) as ReadonlySet<WrappedListener>
  }

  /* =================== Public Mutators =================== */

  /** Add a listener to the given event */
  public add(event: EventKey<EventMap>, listener: WrappedListener): void {
    const set = ListenerSetRegistry.getOrCreateSet(this, event)
    set.add(listener)
    ListenerSetRegistry.touch(this, event)
  }

  /** Add many listeners in a single batch and invalidate once */
  public addAll(event: EventKey<EventMap>, listeners: ReadonlyArray<WrappedListener>): void {
    if (listeners.length === 0) return
    const set = ListenerSetRegistry.getOrCreateSet(this, event)
    for (const listener of listeners) {
      set.add(listener)
    }
    ListenerSetRegistry.touch(this, event)
  }

  /** Remove a listener from the given event */
  public delete(event: EventKey<EventMap>, listener: WrappedListener): boolean {
    const set = this.sets.get(event)
    if (!set) {
      ListenerSetRegistry.throwListenerError(
        "Cannot delete listener; event has no listeners",
        "EVENT_NOT_FOUND",
        event,
      )
    }

    if (!set.has(listener)) {
      ListenerSetRegistry.throwListenerError(
        "Listener not found in set",
        "LISTENER_NOT_FOUND",
        event,
        listener,
      )
    }

    const removed = set.delete(listener)
    if (removed) {
      ListenerSetRegistry.touch(this, event)
    }
    return removed
  }

  /** Remove many listeners in a single batch and invalidate once */
  public deleteAll(event: EventKey<EventMap>, listeners: ReadonlyArray<WrappedListener>): number {
    if (listeners.length === 0) return 0

    const set = this.sets.get(event)
    if (!set) {
      ListenerSetRegistry.throwListenerError(
        "Cannot delete listeners; event has no listeners",
        "EVENT_NOT_FOUND",
        event,
      )
    }

    let removed = 0
    for (const listener of listeners) {
      if (set.has(listener) && set.delete(listener)) {
        removed++
      }
    }

    if (removed > 0) {
      ListenerSetRegistry.touch(this, event)
    }
    return removed
  }

  /** Clear all listener sets and caches */
  public clear(): void {
    this.sets.clear()
    this.readonlyCache.clear()
    this.markDirty()
  }

  /* =================== Public Queries =================== */

  /** Get listener count for a specific event */
  public getCount(event: EventKey<EventMap>): number {
    return this.sets.get(event)?.size ?? 0
  }

  /** Get total number of listeners across all events */
  public totalCount(): number {
    if (!this._totalCountDirty && this._cachedTotalCount !== undefined) {
      return this._cachedTotalCount
    }

    let total = 0
    for (const set of this.sets.values()) total += set.size
    this._cachedTotalCount = total
    this._totalCountDirty = false
    return total
  }

  /* =================== Private Instance Methods =================== */

  /** Require that a set exists for a given event, otherwise throw */
  private requireSet(
    event: EventKey<EventMap>,
  ): EventListenerSetInternal<EventMap, WrappedListener> {
    const set = this.sets.get(event)
    if (!set) {
      ListenerSetRegistry.throwListenerError(
        "No listeners registered for event",
        "NO_LISTENERS",
        event,
      )
    }
    return set
  }

  /** Mark the total count cache as dirty */
  private markDirty(): void {
    this._totalCountDirty = true
  }

  /** Invalidate readonly cache for a specific event */
  private invalidateReadonlyCache(event: EventKey<EventMap>): void {
    this.readonlyCache.delete(event)
  }

  /* =================== Private Static Helpers =================== */

  /** Get a cached readonly view or create one */
  private static getReadonlySet<EventMap extends BaseEventMap, WrappedListener>(
    registry: ListenerSetRegistry<EventMap, WrappedListener>,
    event: EventKey<EventMap>,
  ): ReadonlySet<WrappedListener> {
    const cached = registry.readonlyCache.get(event)
    if (cached) return cached
    const set = ListenerSetRegistry.getOrCreateSet(registry, event)
    const readonlySet = set as ReadonlySet<WrappedListener>
    registry.readonlyCache.set(event, readonlySet)
    return readonlySet
  }

  /** Get an existing set, or create a new one if it doesn't exist */
  private static getOrCreateSet<EventMap extends BaseEventMap, WrappedListener>(
    registry: ListenerSetRegistry<EventMap, WrappedListener>,
    event: EventKey<EventMap>,
  ): Set<WrappedListener> {
    let set = registry.sets.get(event)
    if (!set) {
      set = new Set<WrappedListener>()
      registry.sets.set(event, set)
      ListenerSetRegistry.touch(registry, event)
    }
    return set
  }

  /** Unified cache invalidation helper */
  private static touch<EventMap extends BaseEventMap, WrappedListener>(
    registry: ListenerSetRegistry<EventMap, WrappedListener>,
    event?: EventKey<EventMap>,
  ): void {
    if (event) registry.invalidateReadonlyCache(event)
    registry.markDirty()
  }

  /** Unified error throwing helper */
  private static throwListenerError<EventMap extends BaseEventMap>(
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
