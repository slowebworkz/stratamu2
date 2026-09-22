import { isNonEmptyString } from "guardz"

// This pattern must not have the `g` or `y` flag: `test` would then keep state between calls and
// alternate between matching and not matching.
const NAMESPACED_KIND_PATTERN = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/

/**
 * Whether a value is a namespaced kind: a dotted name in lower case, such as `diku.command` or
 * `mush.wait`. Every kind in the system has this shape, so a MUSH `command` and a Diku `command`
 * cannot collide. Use it on data that has not been checked, such as a kind read back from storage.
 */
export function isNamespacedKind(value: unknown): value is `${string}.${string}` {
  return isNonEmptyString(value) && NAMESPACED_KIND_PATTERN.test(value)
}
