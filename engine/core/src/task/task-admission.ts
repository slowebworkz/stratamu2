import type { TaskPriority } from "@stratamu/primitives"
import type { Submission } from "@stratamu/submission"
import type { Work } from "@stratamu/work"

import type { LaneId } from "../lane/index.ts"

/**
 * A `Submission`, plus the admission-time extras this runtime still needs. What `Runtime.submit`
 * accepts and `#admit` turns into a `Task`.
 *
 * None of `lane`, `tags` or `priority` are part of `Submission`, but for different reasons.
 * `priority` becomes part of the admitted `Task`: it is admission-time execution metadata, an
 * intrinsic ordering attribute of the execution, and `Submission` just has not grown a field for
 * it yet. `lane` and `tags` do not become part of `Task` at all: they are runtime queue
 * membership, a fact about where a task is being run rather than what it is, so they end up on
 * `TaskRecord` instead. See `@stratamu/submission` and `@stratamu/task`.
 */
export interface TaskAdmission<W extends Work = Work> extends Submission<W> {
  /** The queue that orders the task. Defaults to the global lane. */
  readonly lane?: LaneId
  /** Labels for cancelling related tasks together. */
  readonly tags?: readonly string[]
  /** Defaults to the lowest priority if not given. The engine decides one either way. */
  readonly priority?: TaskPriority
}
