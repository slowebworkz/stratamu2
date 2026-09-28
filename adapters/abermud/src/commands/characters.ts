import type { Session, Sessions } from "@stratamu/engine-sessions"
import type { EntityId, PrincipalId } from "@stratamu/primitives"

import type { Control } from "../control.ts"
import { principalControlling } from "../control.ts"

/**
 * A character currently controlled by a connected, actively-playing session. TELL and KILL both
 * need this before they can do anything else with a named target: a name resolves to a
 * character, a character to whoever plays it, and that principal to whether they're actually
 * online right now -- the same three steps `charactersByName` alone was never enough for.
 */
export interface ActiveCharacter {
  readonly entity: EntityId
  readonly principal: PrincipalId
  readonly session: Session
}

/**
 * Resolves a character name to an `ActiveCharacter`, or `undefined` for any of: the name is
 * unknown, it names a character nobody currently controls, or it names one whose controlling
 * principal has no active session. Matches the source's own `fpbn()` (`mud/blood.c`), which only
 * ever scans live, connected characters in the first place -- an unknown name and a known-but-
 * offline one are the identical failure there, and here.
 */
export function resolveActiveCharacter(
  name: string,
  charactersByName: ReadonlyMap<string, EntityId>,
  control: Control,
  sessions: Sessions | undefined,
): ActiveCharacter | undefined {
  const entity = charactersByName.get(name.trim().toLowerCase())
  if (entity === undefined) {
    return undefined
  }
  const principal = principalControlling(control, entity)
  if (principal === undefined) {
    return undefined
  }
  const session = sessions?.activeFor(principal)
  if (session === undefined) {
    return undefined
  }
  return { entity, principal, session }
}
