import { BaseError } from "@/errors"
import type { AllEventKeys, InternalEventKey } from "@/events"
import type { EventListener } from "@/registry"
import { ListenerSetRegistry, ListenerWrapperRegistry, SeenEventRegistry } from "@/registry"
import type { EventListenerSetInternal } from "@/registry"
import type { BaseEventMap, EventKey, ListenerFn } from "@repo/types"

/**
 * ListenerRegistry centralizes listener bookkeeping for event emitters.
 * It manages mappings between original and wrapped listeners, listener sets, and seen events.
 *
 * Invariant:
 * - A wrapped listener exists in `listenerSetRegistry`
 *   iff a corresponding original→wrapped mapping exists
 *   in `listenerWrapperRegistry`.
 */

export class ListenerRegistry<
  EventMap extends BaseEventMap,
  WrappedListener = ListenerFn<EventMap, AllEventKeys<EventMap>>,
> {
  /* ------------------- Private Storage ------------------- */

  /** Event → set of wrapped listeners */
  private readonly listenerSetRegistry = new ListenerSetRegistry<EventMap, WrappedListener>()

  /** Event → (original → wrapped) listener mappings */
  private readonly listenerWrapperRegistry = new ListenerWrapperRegistry<
    EventMap,
    WrappedListener
  >()

  /** Events that have been observed/emitted */
  private readonly seenEvents = new SeenEventRegistry<EventMap>()

  /* ------------------- Registration ------------------- */

  private addListener<E extends EventKey<EventMap>>(
    event: E,
    listener: EventListener<EventMap, E>,
    wrappedListener: WrappedListener,
  ): void {
    this.listenerSetRegistry.add(event, wrappedListener)
    this.listenerWrapperRegistry.add(event, listener, wrappedListener)
  }

  /**
   * Register a public (string-keyed) listener that will be wrapped for Emittery compatibility.
   * Public listeners are single-arg shaped internally for Emittery integration.
   *
   * @template E - Must be a string-keyed event from EventMap
   */
  public addPublicListener<E extends Extract<EventKey<EventMap>, string>>(
    event: E,
    listener: EventListener<EventMap, E>,
    wrappedListener: WrappedListener,
  ): void {
    this.addListener(event, listener, wrappedListener)
  }

  /**
   * Register an internal (symbol-keyed) listener without wrapping.
   * Internal listeners maintain their original spread-args shape.
   */
  public addInternalListener<E extends Extract<EventKey<EventMap>, symbol>>(
    event: E,
    listener: EventListener<EventMap, E>,
  ): void {
    const wrappedListener = listener as unknown as WrappedListener
    this.addListener(event, listener, wrappedListener)
  }

  public removeListener<E extends EventKey<EventMap>>(
    event: E,
    listener: EventListener<EventMap, E>,
  ): void {
    const wrappedListener = this.listenerWrapperRegistry.get(event, listener)
    if (!wrappedListener) {
      throw new BaseError("Cannot remove listener; not registered", {
        code: "LISTENER_NOT_REGISTERED",
        category: "internal",
        metadata: { event: String(event), listener: listener.toString() },
      })
    }

    this.listenerWrapperRegistry.delete(event, listener)
    this.listenerSetRegistry.delete(event, wrappedListener)
  }

  /* ------------------- Query/Inspection ------------------- */

  public getListenerCount(event?: EventKey<EventMap>): number {
    if (event !== undefined) {
      return this.listenerSetRegistry.getCount(event)
    }
    return this.listenerSetRegistry.totalCount()
  }

  public hasListener<E extends EventKey<EventMap>>(
    event: E,
    listener: EventListener<EventMap, E>,
  ): boolean {
    const wrappedListener = this.listenerWrapperRegistry.get(event, listener)
    if (!wrappedListener) return false

    const listenerSet = this.listenerSetRegistry.require(event)
    return listenerSet.has(wrappedListener)
  }

  public getListeners<E extends EventKey<EventMap>>(event: E): EventListener<EventMap, E>[] {
    const listeners = this.listenerWrapperRegistry.keys(event)
    if (listeners.length === 0) {
      throw new BaseError("No listeners registered for event", {
        code: "NO_LISTENERS",
        category: "internal",
        metadata: { event: String(event) },
      })
    }
    return Array.from(listeners)
  }

  public getWrappedListener<E extends EventKey<EventMap>>(
    event: E,
    listener: EventListener<EventMap, E>,
  ): WrappedListener {
    const wrapped = this.listenerWrapperRegistry.get(event, listener)
    if (!wrapped) {
      throw new BaseError("Wrapped listener not found", {
        code: "WRAPPED_LISTENER_NOT_FOUND",
        category: "internal",
        metadata: { event: String(event), listener: listener.toString() },
      })
    }
    return wrapped
  }

  public getSeenEvents(): ReadonlySet<EventKey<EventMap>> {
    return this.seenEvents.getAll()
  }

  /* ------------------- Utility ------------------- */

  public addSeenEvent(event: EventKey<EventMap>): void {
    this.seenEvents.add(event)
  }

  public clearAll(): void {
    this.listenerSetRegistry.clear()
    this.listenerWrapperRegistry.clear()
    this.seenEvents.clear()
  }

  /* ------------------- Public static Helpers ------------------- */

  /**
   * Wraps a listener so that errors are caught and handled by `onError`.
   * Useful for async listeners or ones added with `once`.
   */
  public static createSafeListener<EventMap extends BaseEventMap, K extends EventKey<EventMap>>(
    listener: ListenerFn<EventMap, K>,
    onError: (error: unknown) => void = console.error,
  ): ListenerFn<EventMap, K> {
    return async (...args: Parameters<ListenerFn<EventMap, K>>): Promise<void> => {
      try {
        await listener(...args)
      } catch (err) {
        onError(err)
      }
    }
  }
}
