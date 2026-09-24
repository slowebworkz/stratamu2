import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { WorldState } from "@stratamu/engine-world"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
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
      session?.send("you are not controlling a character")
      return
    }
    session?.send(describeRoom(context.world, rooms, actor))
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

/** What LOOK shows, and what a successful MOVE shows for the room arrived in. */
export function describeRoom(
  world: WorldState | undefined,
  rooms: ReadonlyMap<EntityId, AberRoomDefinition>,
  actor: EntityId,
): string {
  const room = roomOf(world, rooms, actor)
  if (room === undefined) {
    return "you are nowhere"
  }
  const occupantIds = [...(world?.occupants(room.id) ?? [])].filter(id => id !== actor)
  const description = `${room.name}\n${room.description}`
  return occupantIds.length === 0
    ? description
    : `${description}\nAlso here: ${occupantIds.join(", ")}.`
}
