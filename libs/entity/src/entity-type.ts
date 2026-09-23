import { isNamespacedKind } from "@stratamu/primitives"

/**
 * The type of an entity: a dotted name owned by whoever defines it, such as `mush.object`,
 * `moo.room` or `diku.mobile`. Core does not interpret types. It is data a `WorldState` stores
 * and an adapter gives meaning to.
 *
 * This is a template-literal type, not a brand, so a literal type keeps its exact type and a
 * union of `Entity` values narrows on `type`. The type checks at compile time that a type has a
 * namespace (`object` alone is an error). It cannot check the rest of the pattern, such as lower
 * case, so `isEntityType` and `entityType` do that at run time.
 */
export type EntityType = `${string}.${string}`

/**
 * Whether a value is a valid EntityType: a namespaced kind, as `isNamespacedKind` in
 * `@stratamu/primitives` defines it. Use it on data that has not been checked, such as a type read
 * back from storage.
 */
export function isEntityType(value: unknown): value is EntityType {
  return isNamespacedKind(value)
}

/**
 * Checks a type at run time and returns it with its literal type intact. Use it where a type is
 * declared, so a malformed one fails when the module loads:
 * `const MushObject = entityType("mush.object")`.
 */
export function entityType<const T extends EntityType>(value: T): T {
  if (!isEntityType(value)) {
    throw new TypeError(`Invalid entity type: ${String(value)}`)
  }

  return value
}
