import { isNonEmptyString } from "@stratamu/guards"

/**
 * The identity of one session: a particular connection instance, not the person using it. A
 * reconnect gets a new `SessionId`, even for the same `PrincipalId`. Not a plain string, so it
 * cannot be confused with a `PrincipalId`, an `EntityId`, or any other string. Create one with
 * `sessionId`.
 */
export type SessionId = string & {
  readonly __sessionId: unique symbol
}

/**
 * Whether a value can be a session id: a string with something in it. Use it on data that has
 * not been through `sessionId`, such as a value read back from storage.
 */
export function isSessionId(value: unknown): value is SessionId {
  return isNonEmptyString(value)
}

export function sessionId(value: string): SessionId {
  if (!isSessionId(value)) {
    throw new TypeError("A session id cannot be empty")
  }

  return value
}
