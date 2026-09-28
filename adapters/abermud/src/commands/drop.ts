import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal, type DroppedOutput } from "../output.ts"
import { principalControlling } from "../control.ts"
import type { AberObjectDefinition } from "../world/index.ts"
import { findObjectAt } from "./objects.ts"
import { resolveActor } from "./look.ts"

/** DROP: the reverse of GET -- moves a carried object from the actor back to the actor's current
 * room. Verified against `dropitem()` in `mud/objsys.c`; see the package README's "Reference". No
 * `takeable` check on the way back down: the recovered source has none either, beyond one
 * world-content-specific special case this adapter does not model. */
export const drop = workKind("abermud.drop")

export function registerDrop(
  runtime: Runtime,
  control: Control,
  objects: ReadonlyMap<EntityId, AberObjectDefinition>,
): void {
  runtime.handle(drop, (task, context) => {
    const { session, name } = task.work.input as { session: Session | undefined; name: string }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send(refusal("not-controlling"))
      return
    }
    if (name.trim().length === 0) {
      session?.send(refusal("drop-what"))
      return
    }
    const location = context.world?.locationOf(actor)
    if (location === undefined) {
      session?.send(refusal("nowhere"))
      return
    }
    const definition = findObjectAt(context.world, objects, actor, name)
    if (definition === undefined) {
      session?.send(refusal("not-carrying"))
      return
    }

    context.world?.locate(definition.id, location)
    const actorName = session?.principalId ?? actor
    session?.send({
      kind: "dropped",
      perspective: "actor",
      actor: actorName,
      item: definition.name,
    } satisfies DroppedOutput)

    const occupantIds = [...(context.world?.occupants(location) ?? [])]
    const recipients = occupantIds
      .filter(occupantId => occupantId !== actor)
      .map(occupantId => principalControlling(control, occupantId))
      .filter(principal => principal !== undefined)
      .map(principal => context.sessions?.activeFor(principal))
      .filter((recipient): recipient is Session => recipient !== undefined)
    for (const recipient of recipients) {
      recipient.send({
        kind: "dropped",
        perspective: "observer",
        actor: actorName,
        item: definition.name,
      } satisfies DroppedOutput)
    }
  })
}
