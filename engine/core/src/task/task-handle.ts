import type { TaskId, TaskState } from "@stratamu/primitives"

import type { TaskOutcome } from "./task-outcome.ts"

export interface TaskHandle {
  readonly id: TaskId
  readonly state: TaskState
  /** Resolves, never rejects, when the task reaches a final state. A waiting task has not. */
  readonly settled: Promise<TaskOutcome>
  /**
   * Cancels the task. A task that has not started, or is waiting, is removed. A running task's
   * step cannot be interrupted, so its signal is aborted and it ends as cancelled once the step
   * returns. Returns whether anything was cancelled.
   */
  cancel(reason?: unknown): boolean
}
