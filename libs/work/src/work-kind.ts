import { isNamespacedKind } from "@stratamu/primitives"

/**
 * The kind of operation a Work represents: a dotted name owned by whoever defines it, such as
 * `mush.command`, `moo.program` or `diku.combat`. Core does not interpret kinds. It routes work to
 * the handler registered for its kind.
 *
 * This is a template-literal type, not a brand, so a literal kind keeps its exact type and a union
 * of Work values narrows on `kind`. The type checks at compile time that a kind has a namespace
 * (`command` alone is an error). It cannot check the rest of the pattern, such as lower case, so
 * `isWorkKind` and `workKind` do that at run time.
 */
export type WorkKind = `${string}.${string}`

/**
 * Whether a value is a valid WorkKind: a namespaced kind, as `isNamespacedKind` in
 * `@stratamu/primitives` defines it. Use it on data that has not been checked, such as a kind read
 * back from storage.
 */
export function isWorkKind(value: unknown): value is WorkKind {
  return isNamespacedKind(value)
}

/**
 * Checks a kind at run time and returns it with its literal type intact. Use it where a kind is
 * declared, so a malformed one fails when the module loads:
 * `const MushCommand = workKind("mush.command")`.
 */
export function workKind<const K extends WorkKind>(value: K): K {
  if (!isWorkKind(value)) {
    throw new TypeError(`Invalid work kind: ${String(value)}`)
  }

  return value
}
