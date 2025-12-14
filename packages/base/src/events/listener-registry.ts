import { BaseError } from "@/errors"
import type { AllEvents, AllEventKeys, FirstEventArg, SafeOncePromise } from "@/events"
import { emitteryArgToTuple } from "@/events"
import type { Awaitable, BaseEventMap, ListenerFn } from "@repo/types"
import { makeReadonlySet } from "@/utils"

/**
 * ListenerRegistry centralizes listener bookkeeping for event emitters.
 * It manages mappings between original and wrapped listeners, listener sets, and seen events.
 */

export class ListenerRegistry<EventMap extends BaseEventMap> {
  /* ------------------- Private Storage ------------------- */

  private readonly listenerSets = new Map<
    AllEventKeys<EventMap>,
    Set<ListenerFn<EventMap, AllEventKeys<EventMap>>>
  >()

  private readonly listenerMaps = new Map<
    AllEventKeys<EventMap>,
    Map<ListenerFn<EventMap, AllEventKeys<EventMap>>, ListenerFn<EventMap, AllEventKeys<EventMap>>>
  >()

  private readonly seenEvents = new Set<AllEventKeys<EventMap>>()
  private _cachedReadonlySeenEvents?: ReadonlySet<AllEventKeys<EventMap>>
  private _seenEventsChanged = false

  /* ------------------- Registration ------------------- */

  public addListener<E extends AllEventKeys<EventMap>>(
    event: E,
    listener: ListenerFn<EventMap, E>,
    wrap?: (listener: ListenerFn<EventMap, E>) => ListenerFn<EventMap, E>,
  ) {
    const set = this.getListenerSet(event)
    const map = this.getListenerMap(event)

    const wrapped = wrap?.(listener) ?? listener

    set.add(wrapped)
    map.set(listener, wrapped)
  }

  public removeListener<E extends AllEventKeys<EventMap>>(
    event: E,
    listener: ListenerFn<EventMap, E>,
  ) {
    const set = this.getListenerSet(event)
    const map = this.getListenerMap(event)

    return ListenerRegistry.removeWrappedListener(set, map, listener)
  }

  public removeAllListenersFor<E extends AllEventKeys<EventMap>>(event: E): void {
    const set = this.getListenerSet(event)
    const map = this.getListenerMap(event)

    // remove both map + set entries
    set.clear()
    map.clear()
  }

  public removeListenersByTarget(
    predicate: (listener: ListenerFn<EventMap, AllEventKeys<EventMap>>) => boolean,
  ) {
    let removed = 0

    for (const { set, map, original } of this.matchingListeners(predicate)) {
      if (ListenerRegistry.removeWrappedListener(set, map, original)) {
        removed++
      }
    }

    return removed
  }

  /* ------------------- Query/Inspection ------------------- */

  public getListenerCount(event?: AllEventKeys<EventMap>): number {
    if (event !== undefined) {
      return this.listenerSets.get(event)?.size ?? 0
    }

    let total = 0
    for (const s of this.listenerSets.values()) total += s.size

    return total
  }

  public hasListener<E extends AllEventKeys<EventMap>>(
    event: E,
    listener: ListenerFn<EventMap, E>,
  ): boolean {
    const wrapped = this.getListenerMap(event).get(listener)
    return wrapped ? this.getListenerSet(event).has(wrapped) : false
  }

  public getListeners<E extends AllEventKeys<EventMap>>(event: E): ListenerFn<EventMap, E>[] {
    const map = this.getListenerMap(event)
    return Array.from(map.keys())
  }

  public getWrappedListener<E extends AllEventKeys<EventMap>>(
    event: E,
    original: ListenerFn<EventMap, E>,
  ): ListenerFn<EventMap, E> | undefined {
    return this.getListenerMap(event).get(original)
  }

  public getSeenEvents(): ReadonlySet<AllEventKeys<EventMap>> {
    if (this._seenEventsChanged || !this._cachedReadonlySeenEvents) {
      this._cachedReadonlySeenEvents = makeReadonlySet(this.seenEvents)
      this._seenEventsChanged = false
    }
    return this._cachedReadonlySeenEvents
  }

  /* ------------------- Utility ------------------- */

  public addSeenEvent(event: AllEventKeys<EventMap>) {
    if (!this.seenEvents.has(event)) {
      this.seenEvents.add(event)
      if (!this._seenEventsChanged) this._seenEventsChanged = true
    }
  }

  public clearAll() {
    this.listenerSets.clear()
    this.seenEvents.clear()
    this.listenerMaps.clear()
    if (!this._seenEventsChanged) this._seenEventsChanged = true
  }

  /* ------------------- Internal Retrieval ------------------- */

  protected getListenerSet<E extends AllEventKeys<EventMap>>(
    event: E,
  ): Set<ListenerFn<EventMap, E>> {
    return ListenerRegistry.getOrCreateSet(this.listenerSets, event) as Set<ListenerFn<EventMap, E>>
  }

  protected getListenerMap<E extends AllEventKeys<EventMap>>(
    event: E,
  ): Map<ListenerFn<EventMap, E>, ListenerFn<EventMap, E>> {
    return ListenerRegistry.getOrCreateMap(this.listenerMaps, event) as Map<
      ListenerFn<EventMap, E>,
      ListenerFn<EventMap, E>
    >
  }

  /* ------------------- Private static Helpers ------------------- */

  private static getOrCreateMap<K, V>(root: Map<K, Map<V, V>>, key: K): Map<V, V> {
    if (!root.has(key)) {
      const map = new Map<V, V>()
      root.set(key, map)

      return map
    }

    return root.get(key) as Map<V, V>
  }

  private static getOrCreateSet<K, V>(root: Map<K, Set<V>>, key: K): Set<V> {
    let set = root.get(key)

    if (!set) {
      set = new Set<V>()
      root.set(key, set)
    }

    return set
  }

  private static removeWrappedListener<K, V>(set: Set<V>, map: Map<V, V>, original: V): boolean {
    const wrapped = map.get(original)
    if (!wrapped) return false
    map.delete(original)
    return set.delete(wrapped)
  }

  private *matchingListeners(
    predicate: (listener: ListenerFn<EventMap, AllEventKeys<EventMap>>) => boolean,
  ) {
    for (const [event, set] of this.listenerSets) {
      const map = this.listenerMaps.get(event)
      if (!map) continue
      for (const [original, wrapped] of map) {
        if (predicate(original)) yield { event, original, wrapped, set, map }
      }
    }
  }

  /* ------------------- Public static Helpers ------------------- */

  public static createSafeListener<EventMap extends BaseEventMap, K extends AllEventKeys<EventMap>>(
    listener: ListenerFn<EventMap, K>,
    onError: (error: unknown) => void = console.error,
  ) {
    return async (eventData: EventMap[K]): Promise<void> => {
      try {
        await listener(...(emitteryArgToTuple(eventData) as EventMap[K]))
      } catch (err) {
        onError(err)
      }
    }
  }
}
