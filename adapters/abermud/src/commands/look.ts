import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { WorldState } from "@stratamu/engine-world"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal } from "../output.ts"
import type { RoomOutput } from "../output.ts"
import type { AberRoomDefinition } from "../world/index.ts"

/** LOOK: the full room description. */
export const look = workKind("abermud.look")

export function registerLook(
  runtime: Runtime,
  control: Control,
  rooms: ReadonlyMap<EntityId, AberRoomDefinition>,
): void {
  runtime.handle(look, (task, context) => {
    const { session } = task.work.input as { session: Session | undefined }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send(refusal("not-controlling"))
      return
    }
    session?.send(describeRoom(context.world, rooms, actor) ?? refusal("nowhere"))
  })
}

/** The character a session currently controls, if any. */
export function resolveActor(control: Control, session: Session | undefined): EntityId | undefined {
  return session?.principalId === undefined ? undefined : control.get(session.principalId)
}

/** The room an actor currently occupies, if `WorldState` has a location recorded for it and that
 * location is a known room. */
export function roomOf(
  world: WorldState | undefined,
  rooms: ReadonlyMap<EntityId, AberRoomDefinition>,
  actor: EntityId,
): AberRoomDefinition | undefined {
  const location = world?.locationOf(actor)
  return location === undefined ? undefined : rooms.get(location)
}

/** What LOOK shows, and what a successful MOVE shows for the room arrived in. `undefined` when the
 * actor is not in a known room. */
export function describeRoom(
  world: WorldState | undefined,
  rooms: ReadonlyMap<EntityId, AberRoomDefinition>,
  actor: EntityId,
): RoomOutput | undefined {
  const room = roomOf(world, rooms, actor)
  if (room === undefined) {
    return undefined
  }
  return {
    kind: "room",
    name: room.name,
    description: room.description,
    occupants: [...(world?.occupants(room.id) ?? [])].filter(id => id !== actor),
  }
}
