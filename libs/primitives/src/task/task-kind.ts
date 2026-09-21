import { isPattern } from "guardz"

/**
 * What a task is, as a dotted name owned by whoever defines it: `diku.command`, `mush.wait`,
 * `combat.attack`. Core does not interpret kinds. It routes a task to the handler registered for
 * its kind. Create one with `taskKind`.
 */
export type TaskKind = string & {
  readonly __taskKind: unique symbol
}

// This pattern must not have the `g` flag: `isPattern` tests with the regex's own state, so a
// global regex would alternate between matching and not matching.
const isKindName = isPattern(/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/)

/**
 * Whether a value can be a task kind: a dotted name in lower case. Use it on data that has not
 * been through `taskKind`, such as a value read back from storage.
 */
export function isTaskKind(value: unknown): value is TaskKind {
  return isKindName(value)
}

export function taskKind(value: string): TaskKind {
  if (!isTaskKind(value)) {
    throw new TypeError(`A task kind is a dotted name such as "diku.command", received "${value}"`)
  }

  return value
}
