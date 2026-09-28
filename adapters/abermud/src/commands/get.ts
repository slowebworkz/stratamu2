import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal, type TakenOutput } from "../output.ts"
import { principalControlling } from "../control.ts"
import type { AberObjectDefinition } from "../world/index.ts"
import { findObjectAt } from "./objects.ts"
import { resolveActor } from "./look.ts"

/**
 * GET/TAKE: moves a takeable object from the actor's room into the actor's own inventory.
 * `WorldState.locate` reused unchanged for the pickup itself -- "carried" and "in a room" are
 * both just "located at this entity" (see `engine/world`'s README, and AberMUD II's own recovered
 * source, which stores a carried object's location in the identical field a room-located object's
 * location uses). Verified against `getobj()` in `mud/objsys.c`; see the package README's
 * "Reference" for the direct link. No carry-capacity check yet -- see `AberObjectDefinition`.
 */
export const get = workKind("abermud.get")

export function registerGet(
  runtime: Runtime,
  control: Control,
  objects: ReadonlyMap<EntityId, AberObjectDefinition>,
): void {
  runtime.handle(get, (task, context) => {
    const { session, name } = task.work.input as { session: Session | undefined; name: string }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send(refusal("not-controlling"))
      return
    }
    if (name.trim().length === 0) {
      session?.send(refusal("get-what"))
      return
    }
    const location = context.world?.locationOf(actor)
    if (location === undefined) {
      session?.send(refusal("nowhere"))
      return
    }
    const definition = findObjectAt(context.world, objects, location, name)
    if (definition === undefined) {
      session?.send(refusal("not-here"))
      return
    }
    if (!definition.takeable) {
      session?.send(refusal("not-takeable"))
      return
    }

    context.world?.locate(definition.id, actor)
    const actorName = session?.principalId ?? actor
    session?.send({
      kind: "taken",
      perspective: "actor",
      actor: actorName,
      item: definition.name,
    } satisfies TakenOutput)

    const occupantIds = [...(context.world?.occupants(location) ?? [])]
    const recipients = occupantIds
      .filter(occupantId => occupantId !== actor)
      .map(occupantId => principalControlling(control, occupantId))
      .filter(principal => principal !== undefined)
      .map(principal => context.sessions?.activeFor(principal))
      .filter((recipient): recipient is Session => recipient !== undefined)
    for (const recipient of recipients) {
      recipient.send({
        kind: "taken",
        perspective: "observer",
        actor: actorName,
        item: definition.name,
      } satisfies TakenOutput)
    }
  })
}
