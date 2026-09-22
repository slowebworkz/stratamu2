import type { TaskId, TaskPriority, TaskSequence } from "@stratamu/primitives"
import type { Work } from "@stratamu/work"

/**
 * The immutable, engine-facing description of one admitted execution instance: a `Work` plus
 * what the engine needed to admit it.
 *
 * `id` and `sequence` are assigned once, at admission, and never change. `priority` is required:
 * it must be decided at admission, even if a policy chooses to ignore it.
 *
 * Deliberately not here yet: `lane`, `tags` and the trigger that scheduled it. Their ownership
 * is not settled. `TaskState`, in `@stratamu/primitives`, is not part of `Task` either: it is
 * lifecycle, which the engine's `TaskRecord` carries, not this durable identity.
 */
export interface Task<W extends Work = Work> {
  readonly id: TaskId
  readonly work: W
  readonly sequence: TaskSequence
  readonly priority: TaskPriority
}
