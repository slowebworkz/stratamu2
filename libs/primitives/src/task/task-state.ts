import { isOneOf } from "@stratamu/guards"

/** Every task state, in the order a task moves through them. */
export const TASK_STATES = [
  "pending",
  "ready",
  "running",
  "scheduled",
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
 * | `pending`   | Waiting for its scheduled time to arrive, before ever running                  |
 * | `ready`     | Eligible to run now, waiting to be selected                                    |
 * | `running`   | Its step is executing                                                          |
 * | `scheduled` | Ran at least once and asked to become eligible again at a scheduled time       |
 * | `waiting`   | Suspended on something other than time: an event, a condition, input, a semaphore |
 * | `completed` | Finished normally (final)                                                      |
 * | `failed`    | Its execution ended with an error (final)                                      |
 * | `cancelled` | Prevented from running or finishing (final)                                    |
 *
 * `pending` and `scheduled` are both temporal eligibility ("not until time T"), and `waiting` is
 * logical eligibility ("not until something happens"). They stay distinct states rather than one
 * shared "temporally not-yet-eligible" state because they mean different things about the task's
 * history: `pending` is a task that has never run, `scheduled` is one that has already run at
 * least once and chose to run again. A new task is immediately `ready`, `pending` or `waiting`,
 * never `scheduled`: that state is only reached from `running`. `pending` never means "new".
 */
export type TaskState = (typeof TASK_STATES)[number]

const isState = isOneOf(TASK_STATES)

/**
 * Whether a value is a task state. Use it on data that has not been checked, such as a state read
 * back from storage.
 */
export function isTaskState(value: unknown): value is TaskState {
  return isState(value)
}
