import type { EntityId, PrincipalId } from "@stratamu/primitives"

/** Maps an authenticated principal to the AberMUD character it currently controls. */
export type Control = Map<PrincipalId, EntityId>

/** The principal currently controlling this character, if any. */
export function principalControlling(control: Control, entity: EntityId): PrincipalId | undefined {
  for (const [principal, controlled] of control) {
    if (controlled === entity) {
      return principal
    }
  }
  return undefined
}
