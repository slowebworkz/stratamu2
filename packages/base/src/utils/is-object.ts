import isPlainObject from "is-plain-object"

/**
 * Returns true if the argument is a plain object (not null, not array, not function, not class instance).
 * Uses is-plain-object for robust detection.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value)
}
