import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { AllEventKeys } from "@repo/events"
import { RegistryBase } from "@repo/events"
import { makeReadonlySet } from "@repo/base"

type ListenerSet<EventMap extends BaseEventMap, K extends keyof EventMap = keyof EventMap> = Set<
  SingleArgListener<EventMap, K>
>

type ReadonlyListenerSet<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap>,
> = ReadonlySet<SingleArgListener<EventMap, RegistryKey>>

export class ListenerSetRegistry<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap> = AllEventKeys<EventMap>,
> extends RegistryBase {
  /* -------------- 🔒 Protected Storage --------------------- */

  /** Map of event → Set of wrapped listeners (typed by event key) */
  protected readonly registry = new Map<RegistryKey, ListenerSet<EventMap>>()

  /* -------------- 🔒 Private Storage ----------------------- */

  /** Cached ReadonlySet views for public consumption */
  private readonly readonlyCache = new Map<
    RegistryKey,
    ReadonlyListenerSet<EventMap, RegistryKey>
  >()

  /* -------------- 🛡️ Protected Methods -------------------- */

  protected invalidateCache(event: RegistryKey): void {
    this.deleteFromCache(event, this.readonlyCache)
  }

  /* -------------- 📤 Public Accessors ---------------------- */

  /**
   * Get a readonly view of listeners for the given event.
   * Get a readonly snapshot of listeners for the given event.
   */
  public get(event: RegistryKey): ReadonlyListenerSet<EventMap, RegistryKey> {
    // Return cached readonly set if available
    let cached = this.getCachedReadonlySet(event)
    if (cached) return cached

    // Use existing set if it exists, otherwise return empty readonly set
    // Note: empty sets are snapshots; they will not update if listeners are later added
    cached = this.createReadonlySnapshot(event)

    this.readonlyCache.set(event, cached as ReadonlyListenerSet<EventMap, RegistryKey>)
    return cached
  }

  /**
   * Require a readonly view of listeners for the given event.
   */
  public require(event: RegistryKey): ReadonlyListenerSet<EventMap, RegistryKey> | undefined {
    const set = this.registry.get(event)
    return set ? makeReadonlySet(set) : undefined
  }

  /* -------------- ✏️ Public Mutators ----------------------- */

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
  /* -------------- 🔧 Private Methods ----------------------- */

  private getCachedReadonlySet(
    event: RegistryKey,
  ): ReadonlyListenerSet<EventMap, RegistryKey> | undefined {
    return this.readonlyCache.get(event) as ReadonlyListenerSet<EventMap, RegistryKey> | undefined
  }

  private createReadonlySnapshot(event: RegistryKey) {
    let set = this.registry.get(event) as Set<SingleArgListener<EventMap, RegistryKey>> | undefined

    if (!set) {
      set = new Set<SingleArgListener<EventMap, RegistryKey>>()
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
