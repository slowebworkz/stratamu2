import type { EntityId } from "@stratamu/primitives"

/**
 * AberMUD's own room vocabulary -- not `WorldState`'s generic `Entity`, which only knows an
 * `EntityId` exists and, via `locate`/`locationOf`, where things currently are. A room's name,
 * description and exit topology are AberMUD-specific facts this adapter owns; `WorldState` is
 * never asked to know any of them.
 *
 * `number` preserves AberMUD's own historical room numbering (the recovered AberMUD II archive
 * stores room text under `TEXT/ROOMS/<number>`) alongside `id`, the `EntityId` this definition is
 * keyed by wherever the adapter also needs `WorldState` to know the room exists (so an actor can
 * be `locate`d there).
 */
export interface AberRoomDefinition {
  readonly id: EntityId
  readonly number: number
  readonly name: string
  readonly description: string
  /** Canonical direction word ("north", "south", "east", "west", "up", "down") -> the room's
   * `EntityId` in that direction. Each room owns its own exits. */
  readonly exits: ReadonlyMap<string, EntityId>
}
