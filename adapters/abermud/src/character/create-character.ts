import type { WorldState } from "@stratamu/engine-world"
import type { EntityId, PrincipalId } from "@stratamu/primitives"
import { entityId } from "@stratamu/primitives"

import type { Control } from "../control.ts"
import type { AberMUDPersona } from "../persistence/index.ts"
import { establishControl } from "./establish-control.ts"

/** Registers a brand-new AberMUD character: the world entity, its name lookup, its live persona,
 * and the principal that now controls it. */
export function createCharacter(
  world: WorldState,
  charactersByName: Map<string, EntityId>,
  personas: Map<EntityId, AberMUDPersona>,
  control: Control,
  principal: PrincipalId,
  name: string,
  persona: AberMUDPersona,
): EntityId {
  const key = name.toLowerCase()
  const id = entityId(`abermud.player:${key}`)
  if (world.has(id)) {
    throw new Error(`Character "${name}" maps to an existing entity "${id}"`)
  }

  world.add(Object.freeze({ id, type: "abermud.player" }))
  charactersByName.set(key, id)
  personas.set(id, persona)
  establishControl(control, principal, id)
  return id
}
