import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { EventKey, AllEventKeys } from "@repo/events"
import { ListenerSetRegistry, ListenerWrapperRegistry } from "./index.ts"
import { BaseError } from "@repo/base"

export class ListenerRegistry<
  EventMap extends BaseEventMap,
  RegistryKey extends SingleArgListener<EventMap, AllEventKeys<EventMap>> = SingleArgListener<
    EventMap,
    AllEventKeys<EventMap>
  >,
> {
  /* -------------- 🔒 Private Storage ----------------------- */

  /** Event → set of wrapped listeners */
  private readonly listenerSetRegistry = new ListenerSetRegistry<EventMap>()

  /** Event → (original → wrapped) listener mappings */
  private readonly listenerWrapperRegistry = new ListenerWrapperRegistry<EventMap>()

  /* -------------- 📝 Registration -------------------------- */

  public add<E extends AllEventKeys<EventMap>>(
    event: E,
    originalListener: SingleArgListener<EventMap, E>,
    wrappedListener: RegistryKey,
  ): void {
    this.listenerSetRegistry.add(event, wrappedListener)
    this.listenerWrapperRegistry.add(
      event,
      ListenerRegistry.toAnyListener(originalListener),
      () => wrappedListener,
    )
  }

  public remove<E extends AllEventKeys<EventMap>>(
    event: E,
    originalListener: SingleArgListener<EventMap, E>,
  ): boolean {
    // Retrieve the wrapped listener for this original listener
    const wrappedListener = this.listenerWrapperRegistry.get(
      event,
      ListenerRegistry.toAnyListener(originalListener),
    )

    if (!wrappedListener) {
      return false // nothing to remove
    }

    // Remove from the ListenerSetRegistry (wrapped listeners)
    this.listenerSetRegistry.delete(event, wrappedListener)

    // Remove from the ListenerWrapperRegistry (original → wrapped mapping)
    return this.listenerWrapperRegistry.delete(
      event,
      ListenerRegistry.toAnyListener(originalListener),
    )
  }

  /* -------------- 🔍 Queries/Inspection -------------------- */

  public getListenerCount(event?: EventKey<EventMap>): number {
    if (event !== undefined) {
      return this.listenerSetRegistry.getCount(event)
    }
    return this.listenerSetRegistry.totalCount
  }

  public hasListener<E extends AllEventKeys<EventMap>>(
    event: E,
    originalListener: SingleArgListener<EventMap, E>,
  ): boolean {
    return this.listenerWrapperRegistry.has(event, ListenerRegistry.toAnyListener(originalListener))
  }

  public get<E extends EventKey<EventMap>>(event: E): SingleArgListener<EventMap, E>[] {
    const listeners = Array.from(
      this.listenerWrapperRegistry.keys(ListenerRegistry.toAnyListenerKey(event)),
    ) as SingleArgListener<EventMap, E>[]

    if (listeners.length === 0) {
      throw new BaseError("No listeners registered for event", {
        code: "NO_LISTENERS",
        category: "internal",
        metadata: { event: String(event) },
      })
    }

    return listeners.map(
      singleArgListener =>
        ((...args: [EventMap[E]]) => singleArgListener(args[0])) as SingleArgListener<EventMap, E>,
    )
  }

  /* -------------- 🔧 Static: Private utilities ------------- */

  /** Casts a listener to the registry-wide type for compatibility */
  private static toAnyListener<
    EventMap extends BaseEventMap,
    ListenerKey extends AllEventKeys<EventMap>,
  >(
    listener: SingleArgListener<EventMap, ListenerKey>,
  ): SingleArgListener<EventMap, AllEventKeys<EventMap>> {
    return listener as unknown as SingleArgListener<EventMap, AllEventKeys<EventMap>>
  }

  private static toAnyListenerKey<
    EventMap extends BaseEventMap,
    ListenerKey extends EventKey<EventMap>,
  >(event: ListenerKey): AllEventKeys<EventMap> {
    return event as AllEventKeys<EventMap>
  }
}
