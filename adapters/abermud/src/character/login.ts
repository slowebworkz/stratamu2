import type { Session } from "@stratamu/engine-sessions"
import type { WorldState } from "@stratamu/engine-world"
import type { EntityId, PrincipalId } from "@stratamu/primitives"

import { type Control, principalControlling } from "../control.ts"
import type { AberMUDPersona, AberMUDPersonaStore } from "../persistence/index.ts"
import { createCharacter } from "./create-character.ts"
import type { AberMUDSex } from "./create-persona.ts"
import { establishControl } from "./establish-control.ts"
import { loadOrCreatePersona } from "./load-persona.ts"

export type { AberMUDSex } from "./create-persona.ts"

export interface LoginCharacterOptions {
  readonly session: Session
  readonly name: string
  /** Required only when `name` has no persisted persona yet. */
  readonly sex?: AberMUDSex
}

/**
 * Loads an AberMUD character's persistent persona and associates it with the already-authenticated
 * principal on `session`. This is character initialization, not network authentication: `Session`
 * already carries its `PrincipalId`, exactly as the engine-sessions contract requires.
 *
 * The recovered `initme()` behavior is:
 * - existing persona: load score/strength/level/sex;
 * - no persona: create score=0, strength=40, level=1 and obtain sex interactively.
 *
 * The interactive prompt is deliberately represented here as `sex` input rather than being
 * embedded in the transport/session layer. The historical password/user-file authentication
 * path is not part of this slice.
 */
export async function loginCharacter(
  world: WorldState,
  control: Control,
  charactersByName: Map<string, EntityId>,
  personas: Map<EntityId, AberMUDPersona>,
  store: AberMUDPersonaStore,
  options: LoginCharacterOptions,
): Promise<EntityId> {
  const principal = requirePrincipal(options.session)
  const key = options.name.toLowerCase()

  const existingCharacter = charactersByName.get(key)
  if (existingCharacter !== undefined) {
    if (control.get(principal) === existingCharacter) {
      return existingCharacter
    }

    const owner = principalControlling(control, existingCharacter)
    if (owner !== undefined && owner !== principal) {
      throw new Error(`Character "${options.name}" is already controlled`)
    }
  } else if (control.has(principal)) {
    throw new Error(`Principal "${principal}" already controls "${control.get(principal)}"`)
  }

  // For a new character this persists to `store` before the world/control state below exists;
  // a failure in between leaves the persona saved with no matching character. Not atomic, and
  // deliberately not made so here -- revisit once persistence/recovery semantics are developed.
  const persona = await loadOrCreatePersona(store, options.name, options.sex)

  if (existingCharacter !== undefined) {
    personas.set(existingCharacter, persona)
    establishControl(control, principal, existingCharacter)
    return existingCharacter
  }

  return createCharacter(world, charactersByName, personas, control, principal, options.name, persona)
}

function requirePrincipal(session: Session): PrincipalId {
  if (session.principalId === undefined) {
    throw new Error("Cannot initialize a character for an unauthenticated session")
  }
  return session.principalId
}
