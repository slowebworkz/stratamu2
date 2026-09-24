import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import type { AberRoomDefinition } from "../world/index.ts"
import { describeRoom, resolveActor, roomOf } from "./look.ts"

export const move = workKind("abermud.move")

const DIRECTIONS = ["north", "south", "east", "west", "up", "down"] as const

const ALIASES: Readonly<Record<string, (typeof DIRECTIONS)[number]>> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  u: "up",
  d: "down",
}

/** Resolves a raw movement word to a canonical direction: the single-letter alphabet
 * (N/S/E/W/U/D), the full word, or the word following `GO`/`JUMP` once `parser.ts` has already
 * stripped that verb off. Anything else is not a direction. */
export function resolveDirection(raw: string): string | undefined {
  const alias = ALIASES[raw]
  if (alias !== undefined) {
    return alias
  }
  return (DIRECTIONS as readonly string[]).includes(raw) ? raw : undefined
}

export function registerMove(
  runtime: Runtime,
  control: Control,
  rooms: ReadonlyMap<EntityId, AberRoomDefinition>,
): void {
  runtime.handle(move, (task, context) => {
    const { session, direction } = task.work.input as {
      session: Session | undefined
      direction: string
    }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send("you are not controlling a character")
      return
    }
    // Is there an exit from here, in this direction?
    const room = roomOf(context.world, rooms, actor)
    const destination = room?.exits.get(direction)
    if (destination === undefined) {
      session?.send("you can't go that way")
      return
    }
    context.world?.locate(actor, destination)
    // Same description LOOK gives, for wherever the character ended up.
    session?.send(describeRoom(context.world, rooms, actor))
  })
}
