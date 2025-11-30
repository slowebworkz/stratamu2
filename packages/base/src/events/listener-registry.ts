import { BaseError } from "@/errors"
import type { AllEventKeys, ListenerFn } from "@/events"
import type { BaseEventMap } from "@repo/types"

/**
 * ListenerRegistry centralizes listener bookkeeping for event emitters.
 * It manages mappings between original and wrapped listeners, listener sets, and seen events.
 */

export class ListenerRegistry<EventMap extends BaseEventMap> {
  /* ------------------- Public API ------------------- */

  /**
   * Add a listener to both the Set and Map for a given event.
   * Optionally wraps the listener before storing in the Map.
   */
  public addListener<E extends AllEventKeys<EventMap>>(
    event: E,
    listener: ListenerFn<EventMap, E>,
    wrap?: (listener: ListenerFn<EventMap, E>) => ListenerFn<EventMap, E>,
  ): void {
    const set = this.getListenerSet(event)
    const map = this.getListenerMap(event)
    const wrapped = wrap?.(listener) ?? listener
    set.add(listener)
    map.set(listener, wrapped)
  }

  /**
   * Remove a listener from both the Set and Map for a given event.
   * Returns true if the listener was removed from the Set.
   */
  public removeListener<E extends AllEventKeys<EventMap>>(
    event: E,
    listener: ListenerFn<EventMap, E>,
  ): boolean {
    const set = this.getListenerSet(event)
    const map = this.getListenerMap(event)
    map.delete(listener)
    return set.delete(listener)
  }

  /** Remove all listeners registered for a given event */
  public removeAllListenersFor<E extends AllEventKeys<EventMap>>(event: E): void {
    const set = this.getListenerSet(event)
    const map = this.getListenerMap(event)
    map.clear()
    set.clear()
  }

  /** Remove all listeners that reference a given target object (useful for player/entity teardown) */
  public removeListenersByTarget(
    predicate: (listener: ListenerFn<EventMap, AllEventKeys<EventMap>>) => boolean,
  ): number {
    return removeListenersByTargetCore(this.listenerSets, this.listenerMaps, predicate)
  }

  /** Get the number of listeners for a specific event or all events */
  public getListenerCount(event?: AllEventKeys<EventMap>): number {
    return getListenerCountCore(this.listenerSets, event)
  }

  public addSeenEvent(event: AllEventKeys<EventMap>): void {
    this.seenEvents.add(event)
  }

  public getSeenEvents(): ReadonlySet<AllEventKeys<EventMap>> {
    return this.seenEvents
  }

  public clearAll(): void {
    this.listenerSets.clear()
    this.seenEvents.clear()
    this.listenerMaps.clear()
  }

  /* ------------------- Internal retrieval ------------------- */

  protected getListenerSet<E extends AllEventKeys<EventMap>>(
    event: E,
  ): Set<ListenerFn<EventMap, E>> {
    return getListenerSetCore(this.listenerSets, event)
  }

  protected getListenerMap<E extends AllEventKeys<EventMap>>(
    event: E,
  ): Map<ListenerFn<EventMap, E>, ListenerFn<EventMap, E>> {
    return getOrCreateMap(this.listenerMaps, event) as Map<
      ListenerFn<EventMap, E>,
      ListenerFn<EventMap, E>
    >
  }

  /**
   * Get all listeners registered for a given event as an array.
   */
  public getListeners<E extends AllEventKeys<EventMap>>(event: E): ListenerFn<EventMap, E>[] {
    return Array.from(this.getListenerSet(event))
  }

  /**
   * Check if a listener is registered for a given event.
   */
  public hasListener<E extends AllEventKeys<EventMap>>(
    event: E,
    listener: ListenerFn<EventMap, E>,
  ): boolean {
    return this.getListenerSet(event).has(listener)
  }

  /**
   * Get the wrapped listener for a given event and original listener.
   * Useful for integration with external systems that require the actual wrapped function.
   */
  public getWrappedListener<E extends AllEventKeys<EventMap>>(
    event: E,
    original: ListenerFn<EventMap, E>,
  ): ListenerFn<EventMap, E> | undefined {
    return this.getListenerMap(event).get(original)
  }

  /* ------------------- Private storage ------------------- */

  /** Map of event key to Set of original listeners (typed per event) */
  private readonly listenerSets = new Map<
    AllEventKeys<EventMap>,
    Set<ListenerFn<EventMap, AllEventKeys<EventMap>>>
  >()

  /** Map of event key to Map of original listener to wrapped listener (typed per event) */
  private readonly listenerMaps = new Map<
    AllEventKeys<EventMap>,
    Map<ListenerFn<EventMap, AllEventKeys<EventMap>>, ListenerFn<EventMap, AllEventKeys<EventMap>>>
  >()

  /** Set of event keys that have been seen (used for metrics, etc.) */
  private readonly seenEvents = new Set<AllEventKeys<EventMap>>()

  /* ------------------- Static API ------------------- */

  /**
   * Creates a listener wrapper that catches errors and delegates to the provided error handler.
   * @param event The event key.
   * @param listener The original listener function.
   * @param onError The error handler to call on error.
   */
  public static createSafeListener<
    EventMap extends BaseEventMap,
    K extends AllEventKeys<EventMap>,
    Ctx,
  >(
    event: K,
    listener: ListenerFn<EventMap, K>,
    onError: (event: K, error: unknown, context: Ctx) => void,
    context: Ctx,
  ): ListenerFn<EventMap, K> {
    return async (...args: EventMap[K]) => {
      try {
        await listener(...args)
      } catch (error) {
        onError(event, error, context)
      }
    }
  }

  /**
   * Helper method to convert single-argument listener to ListenerFn format and create safe wrapper.
   * Useful for 'once' methods that use different listener signatures.
   */
  public static createSafeOnceListener<
    EventMap extends BaseEventMap,
    K extends AllEventKeys<EventMap>,
    Ctx,
  >(
    event: K,
    listener: (
      data: EventMap[K] extends unknown[] ? EventMap[K][0] : EventMap[K],
    ) => Promise<void> | void,
    onError: (event: K, error: unknown, context: Ctx) => void,
    context: Ctx,
  ): ListenerFn<EventMap, K> {
    // Convert single-argument listener to spread-args ListenerFn format
    const listenerAsListenerFn: ListenerFn<EventMap, K> = (...args: EventMap[K]) => {
      // Convert spread args back to single argument for the original listener
      const singleArg = args as EventMap[K] extends unknown[] ? EventMap[K][0] : EventMap[K]
      return listener(singleArg)
    }

    // Return the safe wrapper
    return this.createSafeListener(event, listenerAsListenerFn, onError, context)
  }

  /**
   * Complete async handling for once listeners - creates promise, handles abort signals, and manages cleanup.
   * This centralizes all the complex async logic for .once() methods.
   */
  public static createOncePromise<T = unknown, EventKey = string | number | symbol, Ctx = unknown>(
    originalPromise: Promise<T> & { off?: () => void },
    listener: (data: T) => Promise<void> | void,
    onError: (event: EventKey, error: unknown, context: Ctx) => void,
    context: Ctx & { event: EventKey },
    options?: { signal?: AbortSignal },
  ): Promise<T> & { off?: () => void } {
    // Handle abort signal upfront
    const handleAbort = () => {
      try {
        originalPromise.off?.()
      } catch {
        // Ignore cleanup errors
      }
    }

    if (options?.signal?.aborted) {
      handleAbort()
      return Promise.reject(
        new BaseError("Operation was aborted", {
          code: "OPERATION_ABORTED",
          category: "timeout",
        }),
      ) as Promise<T> & { off?: () => void }
    }

    // Create the wrapped promise with listener execution and error handling
    const wrappedPromise = (async () => {
      const data = await originalPromise
      try {
        await listener(data)
      } catch (error) {
        onError(context.event, error, context)
      }
      return data
    })() as Promise<T> & { off?: () => void }

    // Forward the .off method if available
    if (typeof originalPromise.off === "function") {
      try {
        wrappedPromise.off = originalPromise.off.bind(originalPromise)
      } catch {
        // Ignore binding errors
      }
    }

    // Handle abort signal
    if (options?.signal && !options.signal.aborted) {
      const onAbort = () => handleAbort()

      try {
        options.signal.addEventListener("abort", onAbort)
        wrappedPromise.finally(() => {
          try {
            options.signal?.removeEventListener("abort", onAbort)
          } catch {
            // Ignore cleanup errors
          }
        })
      } catch {
        // Ignore event listener errors
      }
    }

    return wrappedPromise
  }
}

/* ------------------- Helper Functions ------------------- */

/**
 * Get or create a Set for a given event key in a Map.
 * @template E - Event key type
 * @template L - Listener type
 * @param {Map<E, Set<L>>} sets - The map of event keys to sets
 * @param {E} event - The event key
 * @returns {Set<L>} The set of listeners for the event
 */
export function getListenerSetCore<E, L>(sets: Map<E, Set<L>>, event: E): Set<L> {
  let set = sets.get(event)
  if (!set) {
    set = new Set<L>()
    sets.set(event, set)
  }
  return set
}

/**
 * Get or create a Map for a given key in a root Map.
 * @template K - Key type
 * @template V - Value type
 * @param {Map<K, Map<V, V>>} root - The root map
 * @param {K} key - The key to look up or create
 * @returns {Map<V, V>} The map for the given key
 */
export function getOrCreateMap<K, V>(root: Map<K, Map<V, V>>, key: K): Map<V, V> {
  let map = root.get(key)
  if (!map) {
    map = new Map<V, V>()
    root.set(key, map)
  }
  return map
}

/**
 * Remove all listeners matching a predicate from all event sets and maps.
 * @param {Map<unknown, Set<unknown>>} listenerSets - Map of event keys to sets of listeners
 * @param {Map<unknown, Map<unknown, unknown>>} listenerMaps - Map of event keys to listener maps
 * @param {(listener: any) => boolean} predicate - Predicate to match listeners for removal
 * @returns {number} The number of listeners removed
 */
export function removeListenersByTargetCore<K, L>(
  listenerSets: Map<K, Set<L>>,
  listenerMaps: Map<K, Map<L, L>>,
  predicate: (listener: L) => boolean,
): number {
  let removed = 0

  for (const [event, set] of listenerSets) {
    const map = listenerMaps.get(event)
    if (!map) continue

    for (const listener of Array.from(set)) {
      if (predicate(listener)) {
        map.delete(listener)
        set.delete(listener)
        removed++
      }
    }
  }

  return removed
}
/**
 * Get the number of listeners for a specific event or all events.
 * @param {Map<any, Set<any>>} sets - Map of event keys to sets of listeners
 * @param {any} [event] - Optional event key to count listeners for
 * @returns {number} The number of listeners
 */
export function getListenerCountCore<K, L>(sets: Map<K, Set<L>>, event?: K): number {
  if (event !== undefined) return sets.get(event)?.size ?? 0
  let total = 0
  for (const s of sets.values()) total += s.size
  return total
}

/**
 * Utility to tag a listener function with an arbitrary value (e.g., player, NPC, room, etc.).
 * The tag is stored as a non-enumerable property on the function.
 */
export function tagListener<T extends (...args: unknown[]) => unknown, Tag = unknown>(
  listener: T,
  tag: Tag,
): T {
  Object.defineProperty(listener, "__tag", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: tag,
  })
  return listener
}

/**
 * Simple helper to add a listener to a ListenerRegistry, mirroring the core addListener method.
 * This is a convenience for ergonomic/functional usage.
 */
export function addListenerToRegistry<
  EventMap extends BaseEventMap,
  E extends AllEventKeys<EventMap>,
>(
  registry: ListenerRegistry<EventMap>,
  event: E,
  listener: ListenerFn<EventMap, E>,
  wrap?: (listener: ListenerFn<EventMap, E>) => ListenerFn<EventMap, E>,
): void {
  registry.addListener(event, listener, wrap)
}
