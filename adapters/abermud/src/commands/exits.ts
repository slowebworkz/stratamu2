import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal } from "../output.ts"
import type { AberRoomDefinition } from "../world/index.ts"
import { resolveActor, roomOf } from "./look.ts"

/** EXITS: the current room's exit list. */
export const exits = workKind("abermud.exits")

export function registerExits(
  runtime: Runtime,
  control: Control,
  rooms: ReadonlyMap<EntityId, AberRoomDefinition>,
): void {
  runtime.handle(exits, (task, context) => {
    const { session } = task.work.input as { session: Session | undefined }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send(refusal("not-controlling"))
      return
    }
    const room = roomOf(context.world, rooms, actor)
    if (room === undefined) {
      session?.send(refusal("nowhere"))
      return
    }
    const directions = [...room.exits.keys()]
    session?.send(
      directions.length === 0
        ? "there are no obvious exits"
        : `obvious exits: ${directions.join(", ")}`,
    )
  })
}
