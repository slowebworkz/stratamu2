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
  /** The timeline the task waits in while `pending` or `scheduled`. */
  timeline: Timeline<TaskRecord> | undefined
}

export interface TaskRecord {
  /** Canonical data: the engine's admitted, immutable description of this task. */
  readonly task: Task
  /**
   * Not part of `Task`: queueing and cancellation are the runtime's concern, not the task's
   * canonical identity. See `@stratamu/task`.
   */
  readonly lane: LaneId
  readonly tags: readonly string[]
  state: TaskState
  /**
   * See `ReadyTask`. Meaningful only while the task is `ready`, and `0` otherwise: a task has
   * never been in a batch until `#ready` first assigns one, and it carries no batch once it
   * leaves `ready`, cleared alongside `via` in the same places: see `#execute` and `#finish` in
   * `Runtime`.
   */
  batch: number
  /**
   * Temporal information associated with the task while it is temporally scheduled or ready:
   * present while `pending`, `scheduled` or `ready`, undefined otherwise. It is not tied to a
   * particular state name, only to that condition, so it survives `pending -> ready` and
   * `scheduled -> ready` unchanged (`oldestReady` uses it for cross-clock ordering while ready),
   * but is cleared no later than `ready -> running`, so it is never stale while `running`,
   * `waiting`, or in a terminal state: see `#execute`, `#cancel` and `#finish` in `Runtime`.
   */
  via: ReadyVia | undefined
  /**
   * What the task returned to defer its next run, whether by suspending or rescheduling. Opaque
   * to the runtime and defined by the adapter. Handed back once, when the task runs again.
   */
  continuation: unknown
  /** Runtime-only state. */
  readonly execution: TaskExecution
}
