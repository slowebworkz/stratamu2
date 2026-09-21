/**
 * The position of a task in the order tasks were created: a bounded ordinal, not a magnitude.
 * It is a number so it serialises as one. At a million tasks a second it would take about 285
 * years to pass `Number.MAX_SAFE_INTEGER`. Create one with `taskSequence`.
 */
export type TaskSequence = number & {
  readonly __taskSequence: unique symbol
}

/**
 * Whether a value can be a task sequence: a non-negative safe integer. Use it on data that has
 * not been through `taskSequence`, such as a value read back from storage.
 */
export function isTaskSequence(value: unknown): value is TaskSequence {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

export function taskSequence(value: number): TaskSequence {
  if (!isTaskSequence(value)) {
    throw new RangeError("Task sequence must be a non-negative safe integer")
  }

  return value
}
