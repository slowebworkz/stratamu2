import type { PrincipalId, SessionId } from "@stratamu/primitives"

import type { Session } from "./session.ts"

/**
 * Which sessions are currently active: `Sessions`, named alongside `WorldState` in the
 * architecture document's `Engine` sketch, now built because a real operation (session
 * lifecycle) needed it, not designed in ahead of that need.
 *
 * This is the *active* half of a distinction the engine keeps deliberately: `Sessions` answers
 * "who is reachable right now" (`SessionId -> Session`), never "who owns what" (`PrincipalId ->
 * EntityId`, an adapter's `Control` map, not this package's concern). The two have different
 * lifetimes on purpose. A disconnect removes a session from here -- and only from here. It does
 * not touch `Control`, and it never touches `WorldState`: the principal still owns whatever
 * entity it controls, and the entity still exists, exactly as before the disconnect. Only the
 * `SessionId` itself stops resolving to anything.
 *
 * Deliberately small, the same way `WorldState` is: open, look up, and disconnect. Nothing here
 * assigns a `SessionId` (an adapter's connection already has one, the same way an `Entity`
 * already has an `EntityId` before `WorldState.add` ever sees it) and nothing here authenticates
 * a principal (a `Session`'s `principalId` is set once, at construction, by whatever authenticated
 * it -- not this package's concern either).
 */
export class Sessions {
  readonly #active = new Map<SessionId, Session>()

  /** How many sessions are currently active. */
  get size(): number {
    return this.#active.size
  }

  /**
   * Marks a session active. Throws if a session with this id is already active -- the same kind
   * of data-integrity check `WorldState.add` makes for a duplicate `EntityId`: two connections
   * cannot share one `SessionId`. Disconnect the stale one first if this is meant to replace it.
   */
  open(session: Session): void {
    if (this.#active.has(session.id)) {
      throw new Error(`Session "${session.id}" is already active`)
    }
    this.#active.set(session.id, session)
  }

  /** The active session with this id, or undefined if none is active -- never opened, or already
   * disconnected. */
  get(id: SessionId): Session | undefined {
    return this.#active.get(id)
  }

  /** Whether a session with this id is currently active. */
  has(id: SessionId): boolean {
    return this.#active.has(id)
  }

  /**
   * Ends a session's active lifetime. Returns whether it was active. Idempotent: disconnecting an
   * id that is not active -- never opened, or already disconnected -- is a no-op, not an error,
   * the same way `WorldState.remove` tolerates an id that was never there.
   */
  disconnect(id: SessionId): boolean {
    return this.#active.delete(id)
  }

  /**
   * The currently active session for a principal, or undefined if that principal has no active
   * session right now -- never connected, or disconnected. This is how a handler reaches "the
   * person controlling this entity, if they're actually here" without `Sessions` needing to know
   * anything about entities or control: resolve the controlling `PrincipalId` from `Control`
   * first (an adapter's concern, not this package's), then ask here. Computed on demand over the
   * active sessions themselves, not a maintained index -- nothing here has shown a need for one
   * yet, the same reasoning `WorldState.occupants` settled on. A principal is assumed to have at
   * most one active session at a time; nothing here enforces or resolves a violation of that.
   */
  activeFor(principalId: PrincipalId): Session | undefined {
    for (const session of this.#active.values()) {
      if (session.principalId === principalId) {
        return session
      }
    }
    return undefined
  }
}
