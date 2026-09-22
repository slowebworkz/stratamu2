import type { TaskState } from "@stratamu/primitives"
import type { Task } from "@stratamu/task"

import type { LaneId } from "../lane/index.ts"
import type { ReadyVia } from "../policy/index.ts"
import type { TaskOutcome } from "../task/index.ts"
import type { Timeline } from "../timeline/index.ts"

/** The state a task has only while the process runs. It holds live objects and cannot be persisted. */
export interface TaskExecution {
  /** Absent for a task run inline, which shares its parent's signal. */
  readonly controller: AbortController | undefined
  readonly signal: AbortSignal
  readonly settled: Promise<TaskOutcome>
  readonly settle: (outcome: TaskOutcome) => void
  /** How many inline runs deep the task is. Zero for a task the policy chose to run. */
  readonly depth: number
  /** The timeline the task waits in while pending. */
  timeline: Timeline<TaskRecord> | undefined
}

export interface TaskRecord {
  /** Canonical data: the engine's admitted, durable description of this task. */
  readonly task: Task
  /**
   * Not part of `Task`: queueing and cancellation are the runtime's concern, not the task's
   * durable identity. See `@stratamu/task`.
   */
  readonly lane: LaneId
  readonly tags: readonly string[]
  state: TaskState
  /** See `ReadyTask`. Meaningful once the task is ready. */
  batch: number
  /**
   * Present only while the task is `pending` or `ready`, and identifies the temporal schedule
   * used for its current eligibility or order. Retained across `pending -> ready`, since
   * `oldestReady` uses it for cross-clock ordering, but cleared no later than `ready -> running`,
   * so it is never stale while `running`, `waiting`, or in a terminal state: see `#execute`,
   * `#cancel` and `#finish` in `Runtime`.
   */
  via: ReadyVia | undefined
  /** What the task suspended with. It is handed back, once, when the task runs again. */
  continuation: unknown
  /** Runtime-only state. */
  readonly execution: TaskExecution
}
