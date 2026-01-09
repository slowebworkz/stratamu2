import { ListenerWrapper } from "./listeners/listener-wrapper.js"
import Emittery from "emittery"
import { DEV_MODE } from "@repo/base"

import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { AllEvents, AllEventKeys, DisposerFn } from "../types/index.ts"
import { ListenerRegistry } from "./registry/index.ts"
import { SafetyManager } from "./safety/index.ts"
import type { SubscriptionOptions } from "../types/index.ts"

export class SafeEmitter<EventMap extends BaseEventMap> {
  /* -------------- 🔒 Private Storage ----------------------- */

  private readonly _listenerRegistry = new ListenerRegistry<
    EventMap,
    SingleArgListener<EventMap, AllEventKeys<EventMap>>
  >()

  private readonly _safety: SafetyManager<EventMap>

  /* -------------- 🛡️ Protected Storage -------------------- */

  protected readonly _public: Emittery<AllEvents<EventMap>>

  /* -------------- 🔨 Constructor -------------------------- */

  constructor() {
    this._safety = new SafetyManager<EventMap>({
      sanitizeErrors: true,
      safetyLogCap: 100,
    })

    this._public = new Emittery<AllEvents<EventMap>>()
  }

  /* -------------- 📣 Public API: Listeners ---------------- */

  /**
   * Registers a listener for the specified event.
   */
  public on<K extends AllEventKeys<EventMap>>(
    event: K | readonly K[],
    listener: SingleArgListener<EventMap, K>,
    options?: SubscriptionOptions,
  ): void {
    // Only handle single event (not array)
    if (Array.isArray(event)) {
      throw new Error("Array of events not supported in this implementation.")
    }

    if (typeof event !== "string") return

    // wrap listener
    const wrapped = new ListenerWrapper<EventMap, K & string>(
      event,
      listener,
      {
        safety: this._safety,
        onRemove: (ev, l) => this._removeListenerSafe(ev, l),
        once: false,
      }
    )

    // add to registry
    this._listenerRegistry.add(event, listener, wrapped.listener)

    // add to native Emittery
    this._public.on(event, wrapped.listener, options)
  }
  /* -------------- 🔍 Protected: Accessors ----------------- */

  protected get safetyManager(): SafetyManager<EventMap> {
    return this._safety
  }

  /* -------------- ⚠️ Protected: Errors -------------------- */

  /* -------------- 🔧 Private utilities -------------------- */

  private _removeListenerSafe<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: SingleArgListener<EventMap, K>,
  ): void {
    try {
      this._listenerRegistry.remove(event, listener)
    } catch (err) {
      if (DEV_MODE) {
        // Log minimal context in development for debugging
        // Avoid throwing to keep disposer idempotent
        // eslint-disable-next-line no-console
        console.warn("SafeEmitter: failed to remove listener", {
          event,
          listener: typeof listener === "function" ? listener.name : undefined,
          error: err,
        })
      }
    }
  }
}
