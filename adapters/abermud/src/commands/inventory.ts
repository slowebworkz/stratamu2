import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal, type InventoryOutput } from "../output.ts"
import type { AberObjectDefinition } from "../world/index.ts"
import { resolveActor } from "./look.ts"

/** INVENTORY (I/INV): what the actor is carrying -- `occupants(actor)` is the query, the same
 * "location, read the other way" `LOOK`'s room occupants already use, filtered to the objects
 * this adapter knows about. Verified against `inventory()`/`aobjsat()` in `mud/objsys.c`. */
export const inventory = workKind("abermud.inventory")

export function registerInventory(
  runtime: Runtime,
  control: Control,
  objects: ReadonlyMap<EntityId, AberObjectDefinition>,
): void {
  runtime.handle(inventory, (task, context) => {
    const { session } = task.work.input as { session: Session | undefined }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send(refusal("not-controlling"))
      return
    }
    const items = [...(context.world?.occupants(actor) ?? [])]
      .map(id => objects.get(id)?.name)
      .filter((name): name is string => name !== undefined)
    session?.send({ kind: "inventory", items } satisfies InventoryOutput)
  })
}
