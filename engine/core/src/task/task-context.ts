import type { TaskInput } from "./task-input.ts"
import type { TaskOutcome } from "./task-outcome.ts"

export interface TaskContext {
  /** Aborted when the task is cancelled. */
  readonly signal: AbortSignal
  /** What the task suspended with, when it runs again after being woken. Otherwise undefined. */
  readonly continuation: unknown
  /**
   * Runs a task inline, as part of the current step, without queueing it. An inline task cannot
   * suspend, because there is nothing for it to wait inside of: it fails if it tries.
   */
  run(input: TaskInput): Promise<TaskOutcome>
}
