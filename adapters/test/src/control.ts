import type { EntityId, PrincipalId } from "@stratamu/primitives"

/**
 * Who currently controls which entity: the same shape every earlier probe settled on, keyed on
 * `PrincipalId`, not `SessionId`, specifically so a reconnect -- a new session, the same principal
 * -- keeps controlling the same entity. Deliberately still just a `Map`, not a class: nothing has
 * shown a need for anything more than get/set/delete, and `WorldState`/`Sessions` only earned
 * their own classes once a data-integrity rule (a duplicate id) needed enforcing. Ownership isn't
 * that kind of fact -- it's a game rule, which is exactly why this stays the adapter's, not
 * `@stratamu/engine-sessions`'s or `@stratamu/engine-world`'s: see `Sessions`'s own README for the
 * distinction this preserves.
 */
export type Control = Map<PrincipalId, EntityId>

/**
 * The reverse of `Control`: which principal, if any, currently owns this entity. Computed on
 * demand by scanning `Control`, the same "no maintained index until one is needed" reasoning
 * `WorldState.occupants` and `Sessions.activeFor` both settled on. Used by `say`'s fan-out to turn
 * an occupant `EntityId` into the `PrincipalId` whose active session (if any) should hear it.
 */
export function principalControlling(control: Control, entity: EntityId): PrincipalId | undefined {
  for (const [principal, controlled] of control) {
    if (controlled === entity) {
      return principal
    }
  }
  return undefined
}
