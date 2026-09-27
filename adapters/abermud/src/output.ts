import type { EntityId } from "@stratamu/primitives"

/**
 * What a character sees of the room they are in: a game fact, not wording. Occupants are entity
 * ids because `WorldState` holds no names yet; who resolves them to something displayable is an
 * open question (docs/OUTPUT_BOUNDARY.md). Only room views are semantic so far. Every other
 * command still sends a finished string, and `Session.send` still accepts `unknown`.
 */
export interface RoomOutput {
  readonly kind: "room"
  readonly name: string
  readonly description: string
  readonly occupants: readonly EntityId[]
}

/** How a room view reads as text: the presentation half of what `describeRoom` used to do. */
export function renderRoom(room: RoomOutput): string {
  const text = `${room.name}\n${room.description}`
  return room.occupants.length === 0 ? text : `${text}\nAlso here: ${room.occupants.join(", ")}.`
}
