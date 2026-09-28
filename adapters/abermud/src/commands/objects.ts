import type { WorldState } from "@stratamu/engine-world"
import type { EntityId } from "@stratamu/primitives"

import type { AberObjectDefinition } from "../world/index.ts"

/**
 * Finds an `AberObjectDefinition` located at `at`, matched by name (case-insensitive, the full
 * name as the definition gives it). GET and DROP both need this -- "an object in the room" and
 * "an object the actor is carrying" are the identical query, just with a different `at`, the same
 * way `WorldState.locate` is one operation for both (see its README). Unlike
 * `charactersByName`/TELL's static name index, there is no map to build ahead of time: an
 * object's location changes under GET/DROP, so this is computed on demand over `occupants(at)`.
 */
export function findObjectAt(
  world: WorldState | undefined,
  objects: ReadonlyMap<EntityId, AberObjectDefinition>,
  at: EntityId,
  name: string,
): AberObjectDefinition | undefined {
  const target = name.trim().toLowerCase()
  for (const id of world?.occupants(at) ?? []) {
    const definition = objects.get(id)
    if (definition !== undefined && definition.name.toLowerCase() === target) {
      return definition
    }
  }
  return undefined
}
