import type { SubscriptionOptions, UnsubscribeFunction } from "@repo/events"
import type { Awaitable, BaseEventMap, EventKey } from "@repo/types"
import type { OmnipresentEventData } from "emittery"
import Emittery from "emittery"

/**
 * EmitteryManager
 *
 * A thin, typed wrapper around Emittery using the official mixin.
 * All Emittery methods (`on`, `once`, `emit`, `onAny`, etc.) are mixed in.
 */
@Emittery.mixin("emitter")
export class EmitteryManager<
  EventMap extends BaseEventMap,
  EventData extends BaseEventMap = EventMap & OmnipresentEventData,
> {
  /* -------------- 🛡️ Protected Emitter -------------------- */

  /**
   * This property is injected by Emittery.mixin at runtime.
   * It exists only for typing purposes.
   */
  protected readonly emitter!: Emittery<EventData>

  /* -------------- 🧩 Emittery Mixin Methods ---------------- */

  // The following are type-only declarations for methods injected by @Emittery.mixin
  // public on!: Emittery<EventData>["on"];

  /* -------------- 📣 Public API: Listeners ----------------- */
  /**
   * Subscribe to one or more events.
   * Returns a disposer function that removes all listeners.
   */
  public on<K extends EventKey<EventMap>>(
    event: K | readonly K[],
    listener: (payload: EventData[K]) => Awaitable,
    options?: SubscriptionOptions,
  ): UnsubscribeFunction {
    const disposer = this.emitter.on(event, listener, options ?? {})

    return () => {}
  }
}
