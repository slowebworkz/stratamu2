import { isNonEmptyString } from "@stratamu/guards"

/**
 * The identity of an authenticated principal, independent of any particular connection: who is
 * authenticated, not this connection and not their in-world entity. Survives reconnects, and may
 * be associated with more than one `SessionId` over its lifetime. Not a plain string, so it
 * cannot be confused with a `SessionId`, an `EntityId`, or any other string. Create one with
 * `principalId`.
 */
export type PrincipalId = string & {
  readonly __principalId: unique symbol
}

/**
 * Whether a value can be a principal id: a string with something in it. Use it on data that has
 * not been through `principalId`, such as a value read back from storage.
 */
export function isPrincipalId(value: unknown): value is PrincipalId {
  return isNonEmptyString(value)
}

export function principalId(value: string): PrincipalId {
  if (!isPrincipalId(value)) {
    throw new TypeError("A principal id cannot be empty")
  }

  return value
}
