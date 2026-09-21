/**
 * How urgent a task is. Whether priority exists at all, and whether a higher number runs first,
 * is decided by the execution policy. This is only the value. Create one with `taskPriority`.
 */
export type TaskPriority = number & {
  readonly __taskPriority: unique symbol
}

/**
 * Whether a value can be a task priority: a finite number. Use it on data that has not been
 * through `taskPriority`, such as a value read back from storage.
 */
export function isTaskPriority(value: unknown): value is TaskPriority {
  return Number.isFinite(value)
}

export function taskPriority(value: number): TaskPriority {
  if (!isTaskPriority(value)) {
    throw new RangeError("Task priority must be a finite number")
  }

  return value
}
