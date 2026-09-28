import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal, type WornOutput } from "../output.ts"
import type { AberObjectDefinition } from "../world/index.ts"
import { findObjectAt } from "./objects.ts"
import { resolveActor } from "./look.ts"

/**
 * WEAR: marks a carried object worn -- what (future) combat's to-hit formula will read for armor.
 * Verified against `wearcom()` in `mud/new1.c`. No room broadcast, same as WIELD.
 *
 * Simplified from the source: `wearcom()` searches the room as well as what's carried (via
 * `ohereandget()`), so it can say "you don't have that" for something visible but not held,
 * distinctly from "there's nothing like that at all". This only searches what's carried, the same
 * scope GET/DROP/WIELD already use, collapsing that distinction into the one message
 * (`"not-carrying-this"`). Also not modeled: the source's object-specific "can't wear two
 * shields" special case (objects 89/113/114), the same kind of world-content rule GET already
 * leaves out for the runesword/shield pair.
 */
export const wear = workKind("abermud.wear")

export function registerWear(
  runtime: Runtime,
  control: Control,
  objects: ReadonlyMap<EntityId, AberObjectDefinition>,
  worn: Set<EntityId>,
): void {
  runtime.handle(wear, (task, context) => {
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
    if (definition === undefined) {
      session?.send(refusal("not-carrying-this"))
      return
    }
    if (worn.has(definition.id)) {
      session?.send(refusal("already-wearing"))
      return
    }
    if (!definition.wearable) {
      session?.send(refusal("not-wearable"))
      return
    }

    worn.add(definition.id)
    session?.send({ kind: "worn" } satisfies WornOutput)
  })
}
