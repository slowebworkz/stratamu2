import type { AllEventKeys } from "@/events"
import { SeenEventRegistry } from "./seen-event-registry.ts"
import { ListenerSetRegistry } from "./listener-set-registry.ts"
import { ListenerWrapperRegistry } from "./listener-wrapper-registry.ts"
import type { Awaitable, BaseEventMap, EventKey, SingleArgListener } from "@repo/types"

export class ListenerRegistry<
  EventMap extends BaseEventMap,
  WrappedListener = SingleArgListener<EventMap, AllEventKeys<EventMap>>,
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

  public add<E extends AllEventKeys<EventMap>>(
    event: E,
    originalListener: SingleArgListener<EventMap, E>,
    wrappedListener: WrappedListener,
  ): void {
    this.listenerSetRegistry.add(event, wrappedListener)
    this.listenerWrapperRegistry.add(event, originalListener, wrappedListener)
  }
}
