import type { Session, Sessions } from "@stratamu/engine-sessions"
import type { WorldState } from "@stratamu/engine-world"
import type { EntityId } from "@stratamu/primitives"

import type { Control } from "../control.ts"
import { principalControlling } from "../control.ts"

/**
 * Every actively-playing session controlling a character at `location`, `exclude`d if given. The
 * recipient list SAY and QUIT's room broadcasts both need: "which occupants can actually be told
 * something right now," not merely "which entities are here" -- an occupant nobody controls, or
 * whose controller isn't currently connected, is not a recipient.
 */
export function activeSessionsInRoom(
  world: WorldState | undefined,
  control: Control,
  sessions: Sessions | undefined,
  location: EntityId,
  exclude?: EntityId,
): Session[] {
  const recipients: Session[] = []
  for (const entity of world?.occupants(location) ?? []) {
    if (entity === exclude) {
      continue
    }
    const principal = principalControlling(control, entity)
    if (principal === undefined) {
      continue
    }
    const session = sessions?.activeFor(principal)
    if (session === undefined) {
      continue
    }
    recipients.push(session)
  }
  return recipients
}
