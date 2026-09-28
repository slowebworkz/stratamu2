import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal } from "../output.ts"
import type { AberObjectDefinition } from "../world/index.ts"
import { findObjectAt } from "./objects.ts"
import { resolveActor } from "./look.ts"

/**
 * REMOVE: the reverse of WEAR. Verified against `removecom()` in `mud/new1.c`, which has a real
 * quirk this reproduces deliberately, not by oversight: its own `iswornby()` check has no `return`
 * after printing `"You are not wearing this"`, and there is no success message on the path where
 * removal actually happens -- `setcarrf(a,1)` runs silently either way. So here: not currently
 * worn (or not found at all, since this only searches what's carried -- see `wear.ts`'s own note
 * on that simplification) sends the same refusal and stops, since there is nothing to clear either
 * way; actually worn clears it and sends nothing, matching the source's silence exactly.
 */
export const remove = workKind("abermud.remove")

export function registerRemove(
  runtime: Runtime,
  control: Control,
  objects: ReadonlyMap<EntityId, AberObjectDefinition>,
  worn: Set<EntityId>,
): void {
  runtime.handle(remove, (task, context) => {
    const { session, name } = task.work.input as { session: Session | undefined; name: string }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send(refusal("not-controlling"))
      return
    }
    if (name.trim().length === 0) {
      session?.send(refusal("tell-me-more"))
      return
    }
    const definition = findObjectAt(context.world, objects, actor, name)
    if (definition === undefined || !worn.has(definition.id)) {
      session?.send(refusal("not-wearing"))
      return
    }

    worn.delete(definition.id)
  })
}
