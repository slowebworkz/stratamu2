import type { AllEventKeys } from "@/events"
import type { BaseEventMap, SingleArgListener } from "@repo/types"
import { makeReadonlySet } from "@/utils"
import { RegistryBase } from "./registry-base.ts"

type ListenerSet<EventMap extends BaseEventMap, K extends keyof EventMap = keyof EventMap> = Set<
  SingleArgListener<EventMap, K>
>

/* ------------------------------------------------------ */
/*                Listener Set Registry                   */
/* ------------------------------------------------------ */

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

  /** Map of event → Set of wrapped listeners (typed by event key) */
  protected readonly registry = new Map<RegistryKey, ListenerSet<EventMap>>()

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

  /* ------------------- Public Accessors ------------------- */

  /**
   * Get a readonly view of listeners for the given event.
   * Get a readonly snapshot of listeners for the given event.
   */
  public get(event: RegistryKey): ReadonlySet<SingleArgListener<EventMap, RegistryKey>> {
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
    const set = this.registry.get(event)
    return set ? makeReadonlySet(set) : undefined
  }

  /* ------------------- Public Mutators ------------------- */

  /**
   * Note: We always invalidate the cache and mark total count dirty in add/addAll,
   * even if the set is unchanged. This avoids extra branching and keeps the hot path simple.
   * Set.add does not signal if the value was already present.
   */
  /** Add a listener to the given event */
  public add<E extends RegistryKey>(event: E, listener: SingleArgListener<EventMap, E>): void {
    const set = this.getOrCreateSet<E>(event)
    set.add(listener)
    this.didMutate(event)
  }

  /** Add many listeners in a single batch and invalidate once */
  public addAll<E extends RegistryKey>(
    event: E,
    ...listeners: SingleArgListener<EventMap, E>[]
  ): void {
    if (listeners.length === 0) return
    const set = this.getOrCreateSet<E>(event)
    for (const listener of listeners) set.add(listener)
    this.didMutate(event)
  }

  /** Remove a listener from the given event */
  public delete<E extends RegistryKey>(
    event: E,
    listener: SingleArgListener<EventMap, E>,
  ): boolean {
    const set = this.registry.get(event) as Set<SingleArgListener<EventMap, E>> | undefined
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
    const set = this.registry.get(event) as Set<SingleArgListener<EventMap, E>> | undefined
    if (!set) return removed
    for (const listener of listeners) {
      if (set.delete(listener) && !removed) removed = true
    }
    if (removed) this.didMutate(event)
    return removed
  }

  /** Clears all listeners for an event */
  public clear(event: RegistryKey): void {
    const hadSet = this.registry.delete(event)
    if (hadSet) {
      this.didMutate(event)
    }
  }

  /* ------------------- Public Queries ------------------- */

  /** Get the number of listeners for a specific event */
  public getCount(event: RegistryKey): number {
    const set = this.registry.get(event)
    return set?.size ?? 0
  }

  /* ------------------- Private Methods ------------------- */

  private getCachedReadonlySet(
    event: RegistryKey,
  ): ReadonlySet<SingleArgListener<EventMap, RegistryKey>> | undefined {
    return this.readonlyCache.get(event) as
      | ReadonlySet<SingleArgListener<EventMap, RegistryKey>>
      | undefined
  }

  private createReadonlySnapshot<E extends RegistryKey>(event: E) {
    let set = this.registry.get(event) as Set<SingleArgListener<EventMap, E>> | undefined

    if (!set) {
      set = new Set<SingleArgListener<EventMap, E>>()
    }

    return makeReadonlySet(set)
  }

  /** Internal: returns the mutable set for adding/removing listeners */
  private getOrCreateSet<E extends RegistryKey>(event: E): Set<SingleArgListener<EventMap, E>> {
    let set = this.registry.get(event) as Set<SingleArgListener<EventMap, E>> | undefined
    if (!set) {
      set = new Set<SingleArgListener<EventMap, E>>()
      this.registry.set(event, set as ListenerSet<EventMap>)
    }
    return set
  }
}
