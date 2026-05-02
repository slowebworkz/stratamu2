import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { AllEventKeys } from "@repo/events"
import { RegistryBase } from "@repo/events"
import { makeReadonlySet } from "@repo/base"

/** Mutable listener set for a specific event key */
type ListenerSet<EventMap extends BaseEventMap, RegistryKey extends AllEventKeys<EventMap>> = Set<
  SingleArgListener<EventMap, RegistryKey>
>

/** Readonly listener view for a specific event key */
type ReadonlyListenerSet<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap>,
> = ReadonlySet<SingleArgListener<EventMap, RegistryKey>>

export class ListenerSetRegistry<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap> = AllEventKeys<EventMap>,
> extends RegistryBase {
  /* -------------- 🔒 Protected Storage ----------------- */

  /** Event → mutable set of listeners */
  protected readonly registry = new Map<RegistryKey, ListenerSet<EventMap, RegistryKey>>()

  /* ---------------- 🔒 Private Storage ------------------ */

  /** Cached readonly snapshots */
  private readonly readonlyCache = new Map<
    RegistryKey,
    ReadonlyListenerSet<EventMap, RegistryKey>
  >()

  /* ---------------- 🛡️ Protected Methods --------------- */

  protected invalidateCache(event: RegistryKey): void {
    this.deleteFromCache(event, this.readonlyCache)
  }

  /* ---------------- 📤 Public Accessors ---------------- */

  /** Get a readonly snapshot of listeners for an event */
  public get(event: RegistryKey): ReadonlyListenerSet<EventMap, RegistryKey> {
    const cached = this.readonlyCache.get(event)
    if (cached) return cached

    const snapshot = this.createReadonlySnapshot(event)
    this.readonlyCache.set(event, snapshot)
    return snapshot
  }

  /** Require listeners for an event, or return undefined */
  public require(event: RegistryKey): ReadonlyListenerSet<EventMap, RegistryKey> | undefined {
    const set = this.registry.get(event)
    return set ? makeReadonlySet(set) : undefined
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

  /* ---------------- ✏️ Public Mutators ------------------ */

  /** Add a listener to an event */
  public add<E extends RegistryKey>(event: E, listener: SingleArgListener<EventMap, E>): void {
    const set = this.getOrCreateSet(event)
    set.add(listener)
    this.didMutate(event)
  }

  /* -------------- 🔍 Public Queries --------------------- */

  /** Get the number of listeners for a specific event */
  public getCount(event: RegistryKey): number {
    const set = this.registry.get(event)
    return set?.size ?? 0
  }

  /* ---------------- 🔧 Private Helpers ------------------ */

  private createReadonlySnapshot(event: RegistryKey): ReadonlyListenerSet<EventMap, RegistryKey> {
    const set = this.registry.get(event) ?? new Set<SingleArgListener<EventMap, RegistryKey>>()

    return makeReadonlySet(set)
  }

  /** Internal: returns the mutable set for an event */
  private getOrCreateSet<E extends RegistryKey>(event: E): ListenerSet<EventMap, E> {
    let set = this.registry.get(event) as ListenerSet<EventMap, E> | undefined

    if (!set) {
      set = new Set<SingleArgListener<EventMap, E>>()
      this.registry.set(event, set as ListenerSet<EventMap, RegistryKey>)
    }

    return set
  }
}
