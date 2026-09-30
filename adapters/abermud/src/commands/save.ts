import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import { isDefined } from "@stratamu/guards"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal, type SavedOutput, type SaveFailedOutput } from "../output.ts"
import type {
  AberMUDInventoryStore,
  AberMUDPersona,
  AberMUDPersonaStore,
} from "../persistence/index.ts"
import { resolveActor } from "./look.ts"

export const save = workKind("abermud.save")

/** SAVE: persists the controlling character's current persona and inventory. AberMUD's own
 * `saveme()` persists score and character status only; this adapter extends that with the
 * character's carried items, worn set, and wielded weapon when an `inventoryStore` is configured.
 * The message is `saveme()`'s own (`bprintf("\nSaving %s\n",globme)`), not an invented one. */
export function registerSave(
  runtime: Runtime,
  control: Control,
  personas: ReadonlyMap<EntityId, AberMUDPersona>,
  store: AberMUDPersonaStore | undefined,
  worn: ReadonlySet<EntityId>,
  wielding: ReadonlyMap<EntityId, EntityId>,
  inventoryStore: AberMUDInventoryStore | undefined,
): void {
  runtime.handle(save, async (task, context) => {
    const { session } = task.work.input as { session: Session | undefined }
    const actor = resolveActor(control, session)
    if (!isDefined(actor)) {
      session?.send(refusal("not-controlling"))
      return
    }
    if (!isDefined(store)) {
      session?.send(refusal("save-unavailable"))
      return
    }
    const persona = personas.get(actor)
    if (!isDefined(persona)) {
      session?.send(refusal("nothing-to-save"))
      return
    }
    try {
      await store.save(persona)
      if (isDefined(inventoryStore) && isDefined(context.world)) {
        const carried = [...context.world.occupants(actor)]
        await inventoryStore.save({
          name: persona.name,
          inventory: carried,
          worn: carried.filter(id => worn.has(id)),
          wielding: wielding.get(actor),
        })
      }
    } catch {
      session?.send({ kind: "save-failed" } satisfies SaveFailedOutput)
      return
    }
    session?.send({ kind: "saved", name: persona.name } satisfies SavedOutput)
  })
}
