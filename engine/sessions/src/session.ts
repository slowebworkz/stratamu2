import type { PrincipalId, SessionId } from "@stratamu/primitives"

/**
 * One connection: an id, and the principal behind it, once associated. Deliberately minimal and
 * transport-agnostic -- how a message actually reaches whoever is on the other end (a socket, a
 * test fake, anything else) is exactly what `send` abstracts away, and this package has no
 * opinion about it. Four earlier domain probes (session boundary, player control, world
 * movement, world messaging) each declared this same shape locally, because the real shape was
 * one of the open questions those proofs existed to inform. It is settled now: `Sessions` is
 * what actually needed the shape to be real, not another test file re-declaring it.
 *
 * `principalId` is set once, at construction -- not something `Sessions` assigns or changes.
 * Authenticating a session is still entirely the adapter's concern; this package only tracks
 * whether a session (already carrying whatever principal it has) is currently active.
 */
export interface Session {
  readonly id: SessionId
  readonly principalId: PrincipalId | undefined
  send(message: unknown): void
}
