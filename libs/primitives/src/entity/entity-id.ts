import { isNonEmptyString } from "@stratamu/guards"

/**
 * The identity of an entity. It is not a plain string, so an id cannot be confused with a type or
 * any other string. Create one with `entityId`.
 */
export type EntityId = string & {
  readonly __entityId: unique symbol
}

/**
 * Whether a value can be an entity id: a string with something in it. Use it on data that has not
 * been through `entityId`, such as a value read back from storage.
 */
export function isEntityId(value: unknown): value is EntityId {
  return isNonEmptyString(value)
}

export function entityId(value: string): EntityId {
  if (!isEntityId(value)) {
    throw new TypeError("An entity id cannot be empty")
  }

  return value
}
