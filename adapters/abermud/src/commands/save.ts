import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import type { AberMUDPersona, AberMUDPersonaStore } from "../persistence/index.ts"
import { resolveActor } from "./look.ts"

export const save = workKind("abermud.save")

/** SAVE: persists the controlling character's current persona. AberMUD's own `saveme()` persists
 * score and character status, but never carried/worn items -- this adapter has no inventory yet,
 * so there is nothing else it could withhold. The message is `saveme()`'s own
 * (`bprintf("\nSaving %s\n",globme)`), not an invented one. */
export function registerSave(
  runtime: Runtime,
  control: Control,
  personas: ReadonlyMap<EntityId, AberMUDPersona>,
  store: AberMUDPersonaStore | undefined,
): void {
  runtime.handle(save, async task => {
    const { session } = task.work.input as { session: Session | undefined }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send("you are not controlling a character")
      return
    }
    if (store === undefined) {
      session?.send("saving is not available")
      return
    }
    const persona = personas.get(actor)
    if (persona === undefined) {
      session?.send("you have no status to save")
      return
    }
    await store.save(persona)
    session?.send(`Saving ${persona.name}`)
  })
}
