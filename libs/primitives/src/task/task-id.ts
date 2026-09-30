import { isNonEmptyString } from "@stratamu/guards"

/**
 * The identity of a task. It is not a plain string, so an id cannot be confused with a kind or
 * any other string. Create one with `taskId`.
 */
export type TaskId = string & {
  readonly __taskId: unique symbol
}

/**
 * Whether a value can be a task id: a string with something in it. Use it on data that has not
 * been through `taskId`, such as a value read back from storage.
 */
export function isTaskId(value: unknown): value is TaskId {
  return isNonEmptyString(value)
}

export function taskId(value: string): TaskId {
  if (!isTaskId(value)) {
    throw new TypeError("A task id cannot be empty")
  }

  return value
}
