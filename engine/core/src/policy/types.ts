import type { TaskId } from "@stratamu/primitives"
import type { Task } from "@stratamu/task"

import type { ClockId } from "../clock/index.ts"
import type { LaneId } from "../lane/index.ts"
import type { TaskAdmission } from "../task/index.ts"

/** The clock and time a task was waiting for when it became ready. */
export interface ReadyVia {
  readonly clock: ClockId
  readonly dueAt: number
}

/**
 * A task that is ready to run, with the facts the runtime recorded about becoming ready. The
 * runtime records facts and imposes no order: the policy decides what they mean.
 */
export interface ReadyTask {
  readonly task: Task
  /**
   * The observation in which the task became ready. A task with a lower batch became ready
   * earlier. Tasks in the same batch became ready together, so nothing orders them by batch.
   */
  readonly batch: number
  /**
   * Set when the task waited on a clock. Times on one clock are ordered, so tasks with the same
   * `via.clock` are ordered by `via.dueAt`. Times on different clocks cannot be compared, and
   * nothing orders tasks from different clocks unless the policy says so.
   */
  readonly via: ReadyVia | undefined
}

/** A queue of ready tasks. The order of `items()` is storage order and carries no meaning. */
export interface ReadyLane {
  readonly id: LaneId
  readonly size: number
  items(): Iterable<ReadyTask>
}

export interface InlineRequest {
  /** The task asking to run another inline. */
  readonly parent: Task
  readonly admission: TaskAdmission
  /** How many inline runs deep the new task would be. The first is 1. */
  readonly depth: number
}

/**
 * The execution semantics a game imposes on the runtime. The runtime provides the mechanisms
 * (tasks, clocks, timelines, queues, execution) and the policy decides how they are used.
 *
 * A policy is part of the input to the runtime's determinism: for the same policy configuration
 * and the same views it must make the same choice. It may keep state of its own, but must not
 * read wall time or randomness.
 */
export interface ExecutionPolicy {
  /**
   * Chooses which ready task runs next. Called only when at least one task is ready. Returning
   * `undefined` runs nothing further for now, and the ready tasks stay ready. That is how a policy
   * expresses a budget, a wait state or a boundary it will not cross.
   */
  next(lanes: Iterable<ReadyLane>): TaskId | undefined

  /**
   * Whether a task may run another inline with `context.run`. Absent means yes. A policy that
   * returns `false` makes the call reject.
   */
  allowInline?(request: InlineRequest): boolean
}
