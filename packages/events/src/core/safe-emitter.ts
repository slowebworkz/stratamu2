import Emittery from "emittery"

import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { AllEvents, AllEventKeys } from "../types/index.ts"
import { ListenerRegistry } from "./registry/index.ts"

export class SafeEmitter<EventMap extends BaseEventMap> {
  /* -------------- 🔒 Private Storage ----------------------- */

  private readonly _listenerRegistry = new ListenerRegistry<
    EventMap,
    SingleArgListener<EventMap, AllEventKeys<EventMap>>
  >()

  /* -------------- 🛡️ Protected Storage -------------------- */

  protected readonly _public!: Emittery<AllEvents<EventMap>>

  /* -------------- 🔨 Constructor -------------------------- */
  /* -------------- 📤 Public API: Listeners ---------------- */
  /* -------------- 🔍 Protected: Accessors ----------------- */
  /* -------------- ⚠️ Protected: Errors -------------------- */
  /* -------------- 🔧 Static: Private utilities ------------ */
}
