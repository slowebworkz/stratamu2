import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal, type WieldedOutput } from "../output.ts"
import type { AberObjectDefinition } from "../world/index.ts"
import { findObjectAt } from "./objects.ts"
import { resolveActor } from "./look.ts"

/**
 * WIELD: selects a carried object as the actor's weapon -- what (future) combat's damage formula
 * will read. Verified against `weapcom()` in `mud/blood.c`. No room broadcast: wielding is
 * private, observable only once combat itself reads it.
 *
 * Simplified from the source: only searches what the actor is already carrying, matching GET/DROP's
 * own scope, not `weapcom()`'s broader "carried, with a stale-weapon check deferred to hit time"
 * state machine. `wielding` is not cleared here when a previously-wielded weapon leaves the
 * actor's possession; that is DROP's and QUIT's concern, the operations that can actually
 * invalidate it, the same way `WorldState.remove`'s data-integrity checks live with the operation
 * that could violate them. KILL re-validates it again at hit time regardless, matching the
 * source's own `iscarrby()` re-check in `hitplayer()` -- defensive there, not load-bearing.
 */
export const wield = workKind("abermud.wield")

export function registerWield(
  runtime: Runtime,
  control: Control,
  objects: ReadonlyMap<EntityId, AberObjectDefinition>,
  wielding: Map<EntityId, EntityId>,
): void {
  runtime.handle(wield, (task, context) => {
    const { session, name } = task.work.input as { session: Session | undefined; name: string }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send(refusal("not-controlling"))
      return
    }
    if (name.trim().length === 0) {
      session?.send(refusal("wield-what"))
      return
    }
    const definition = findObjectAt(context.world, objects, actor, name)
    if (definition === undefined) {
      session?.send(refusal("no-such-weapon"))
      return
    }
    if (definition.weaponDamage === undefined) {
      session?.send(refusal("not-a-weapon"))
      return
    }

    wielding.set(actor, definition.id)
    session?.send({ kind: "wielded" } satisfies WieldedOutput)
  })
}
