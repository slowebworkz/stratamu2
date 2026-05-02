// import type { OmnipresentEventData } from "emittery"
import Emittery from "emittery"

import type {
  AllEvents,
  AllEventKeys,
  //   DisposerFn,
  PublicEventMap,
  //   SubscriptionOptions,
} from "../../"
import { SafetyManager } from "../safety/index.ts"

import { ListenerRegistry } from "../registry"

import type { Awaitable, BaseEventMap, SingleArgListener } from "@repo/types"

export abstract class SafeEmitter<EventMap extends BaseEventMap> {
  /* ------------------- Private Storage ------------------- */

  private readonly _listenerRegistry = new ListenerRegistry<
    EventMap,
    SingleArgListener<EventMap, AllEventKeys<EventMap>>
  >()

  private readonly _safety!: SafetyManager<EventMap>

  /* ------------------ Protected Storage ------------------ */

  protected readonly _public!: Emittery<AllEvents<EventMap>>

  /* --------------------- Constructor --------------------- */

  constructor() {
    // Compose the safety manager with hardcoded presets (no user config)
    const safetyManagerBus = new Emittery<PublicEventMap<EventMap>>()

    this._safety = new SafetyManager<EventMap>(safetyManagerBus, {
      sanitizeErrors: true,
      safetyLogCap: 100,
    })

    this._public = new Emittery<AllEvents<EventMap>>()
  }

  /* ---------------- Public API: Listeners ---------------- */

  /* ----------------- Protected: Accessors ---------------- */

  protected get _safetyManager(): SafetyManager<EventMap> {
    return this._safety
  }

  /* ------------------ Protected: Errors ------------------ */

  /* -------------- Static: Private utilities -------------- */
}
