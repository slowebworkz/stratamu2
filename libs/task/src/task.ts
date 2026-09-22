import type { TaskId, TaskPriority, TaskSequence } from "@stratamu/primitives"
import type { Work } from "@stratamu/work"

/**
 * The canonical, immutable description of one admitted execution instance: a `Work` plus what the
 * engine needed to admit it. "Canonical" is about shape, not storage: this is persistable data,
 * but whether a queued task is actually persisted across a restart is a separate decision, not
 * yet made.
 *
 * `id` and `sequence` are assigned once, at admission, and never change. `priority` is admission-time
 * execution metadata, required because the engine must decide it at admission, even if the
 * execution policy in use chooses to ignore it. It is an intrinsic ordering attribute of this
 * execution, which is why it is here and `lane` is not: `lane` is runtime queue membership, a
 * fact about where a task is being run, not what it is.
 *
 * Deliberately not here yet: `lane`, `tags` and the trigger that scheduled it, for that reason and
 * because their ownership is not fully settled. `TaskState`, in `@stratamu/primitives`, is not
 * part of `Task` either: it is lifecycle, which the engine's `TaskRecord` carries, not this
 * canonical description.
 */
export interface Task<W extends Work = Work> {
  readonly id: TaskId
  readonly work: W
  readonly sequence: TaskSequence
  readonly priority: TaskPriority
}
