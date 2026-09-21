import { isOneOf } from "guardz"

/** Every task state, in the order a task moves through them. */
export const TASK_STATES = [
  "pending",
  "ready",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
] as const

/**
 * Where a task is in its life.
 *
 * | State       | Meaning                                                                        |
 * |-------------|--------------------------------------------------------------------------------|
 * | `pending`   | Waiting for its scheduled time to arrive                                       |
 * | `ready`     | Eligible to run now, waiting to be selected                                    |
 * | `running`   | Its step is executing                                                          |
 * | `waiting`   | Suspended on something other than time: an event, a condition, input, a semaphore |
 * | `completed` | Finished normally (final)                                                      |
 * | `failed`    | Its execution ended with an error (final)                                      |
 * | `cancelled` | Prevented from running or finishing (final)                                    |
 *
 * `pending` is temporal eligibility ("not until time T") and `waiting` is logical eligibility
 * ("not until something happens"). A new task is immediately `ready`, `pending` or `waiting`, so
 * a task that has not finished is either eligible, running, or has a specific reason it is not
 * eligible. `pending` never means "new".
 */
export type TaskState = (typeof TASK_STATES)[number]

const isState = isOneOf<TaskState>(...TASK_STATES)

/**
 * Whether a value is a task state. Use it on data that has not been checked, such as a state read
 * back from storage.
 */
export function isTaskState(value: unknown): value is TaskState {
  return isState(value)
}
