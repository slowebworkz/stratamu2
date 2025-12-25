import type { AllEventKeys } from "@/events"
import type { BaseEventMap, SingleArgListener } from "@repo/types"
import { makeReadonlySet } from "@/utils"
import { RegistryBase } from "./registry-base.ts"

type ListenerSet<EventMap extends BaseEventMap, E extends AllEventKeys<EventMap>> = Set<
  SingleArgListener<EventMap, E>
>

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
export class ListenerSetRegistry<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap> = AllEventKeys<EventMap>,
> extends RegistryBase {
  /* ------------------- Private Storage ------------------- */

  /** Map of event → Set of wrapped listeners (erased event type internally) */
  private readonly registry = new Map<RegistryKey, ListenerSet<EventMap, RegistryKey>>()

  /** Cached ReadonlySet views for public consumption */
  private readonly readonlyCache = new Map<
    RegistryKey,
    ReadonlySet<SingleArgListener<EventMap, RegistryKey>>
  >()

  /* ------- Private Methods for Cache & Dirty Tracking ------- */

  /** Invalidate the readonly Set cache for a specific event */
  // protected invalidateCache<E extends RegistryKey>(event: E): void {
  //   this.readonlyCache.delete(event)
  // }

  protected invalidateCache<E extends RegistryKey>(event: E): void {
    this.deleteFromCache(event, this.readonlyCache)
  }

  /** Mark the total listener count as dirty */
  private markDirty(): void {
    super.markTotalDirty()
  }

  /* ------------------- Public Accessors ------------------- */

  /**
   * Get a readonly view of listeners for the given event.
   * Get a readonly snapshot of listeners for the given event.
   */
  public get<E extends RegistryKey>(event: E): ReadonlySet<SingleArgListener<EventMap, E>> {
    // Return cached readonly set if available
    let cached = this.getCachedReadonlySet(event)
    if (cached) return cached

    // Use existing set if it exists, otherwise return empty readonly set
    // Note: empty sets are snapshots; they will not update if listeners are later added
    cached = this.createReadonlySnapshot(event)

    this.readonlyCache.set(event, cached as ReadonlySet<SingleArgListener<EventMap, RegistryKey>>)
    return cached
  }

  /**
   * Require a readonly view of listeners for the given event.
   */
  public require<E extends RegistryKey>(
    event: E,
  ): ReadonlySet<SingleArgListener<EventMap, E>> | undefined {
    return this.registry.get(event)
  }

  /* ------------------- Public Mutators ------------------- */

  /**
   * Note: We always invalidate the cache and mark total count dirty in add/addAll,
   * even if the set is unchanged. This avoids extra branching and keeps the hot path simple.
   * Set.add does not signal if the value was already present.
   */
  /** Add a listener to the given event */
  public add<E extends RegistryKey>(event: E, listener: SingleArgListener<EventMap, E>): void {
    const set = this.getOrCreateSet(event)
    set.add(listener)
    this.didMutate(event)
  }

  /** Add many listeners in a single batch and invalidate once */
  public addAll<E extends RegistryKey>(
    event: E,
    ...listeners: SingleArgListener<EventMap, E>[]
  ): void {
    if (listeners.length === 0) return
    const set = this.getOrCreateSet(event)
    for (const listener of listeners) set.add(listener)
    this.didMutate(event)
  }

  /** Remove a listener from the given event */
  public delete<E extends RegistryKey>(
    event: E,
    listener: SingleArgListener<EventMap, E>,
  ): boolean {
    const set = this.registry.get(event) as ListenerSet<EventMap, E> | undefined
    if (!set) return false

    const removed = set.delete(listener)
    if (removed) {
      this.didMutate(event)
    }
    return removed
  }

  public deleteAll<E extends RegistryKey>(
    event: E,
    ...listeners: SingleArgListener<EventMap, E>[]
  ): boolean {
    let removed = false

    if (listeners.length === 0) return removed
    const set = this.registry.get(event) as ListenerSet<EventMap, E> | undefined
    if (!set) return removed

    for (const listener of listeners) {
      if (set.delete(listener) && !removed) removed = true
    }

    if (removed) this.didMutate(event)

    return removed
  }

  /** Clears all listeners for an event */
  public clear<E extends RegistryKey>(event: E): void {
    const hadSet = this.registry.delete(event)
    if (hadSet) {
      this.didMutate(event)
    }
  }

  /* ------------------- Public Queries ------------------- */

  /** Get the number of listeners for a specific event */
  public getCount<E extends RegistryKey>(event: E): number {
    const set = this.registry.get(event) as ListenerSet<EventMap, E> | undefined
    return set ? set.size : 0
  }

  protected computeTotalCount(): number {
    let count = 0
    for (const set of this.registry.values()) {
      count += set.size
    }
    return count
  }

  /* ------------------- Private Methods ------------------- */

  private getCachedReadonlySet<E extends RegistryKey>(
    event: E,
  ): ReadonlySet<SingleArgListener<EventMap, E>> | undefined {
    return this.readonlyCache.get(event) as ReadonlySet<SingleArgListener<EventMap, E>> | undefined
  }

  private createReadonlySnapshot<E extends RegistryKey>(event: E) {
    let set = this.registry.get(event) as Set<SingleArgListener<EventMap, E>> | undefined

    if (!set) {
      set = new Set<SingleArgListener<EventMap, E>>()
    }

    return makeReadonlySet(set)
  }

  /** Internal: returns the mutable set for adding/removing listeners */
  private getOrCreateSet<E extends RegistryKey>(event: E): ListenerSet<EventMap, E> {
    let set = this.registry.get(event) as ListenerSet<EventMap, RegistryKey> | undefined
    if (!set) {
      set = new Set()
      this.registry.set(event, set)
      this.didMutate(event)
    }
    return set as ListenerSet<EventMap, E>
  }
}
