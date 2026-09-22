import type { TaskPriority } from "@stratamu/primitives"
import type { Submission } from "@stratamu/submission"
import type { Work } from "@stratamu/work"

import type { LaneId } from "../lane/index.ts"

/**
 * A `Submission`, plus the admission-time extras the runtime still needs for its own queueing and
 * cancellation. What `Runtime.submit` accepts and `#admit` turns into a `Task`.
 *
 * `lane`, `tags` and `priority` are not part of `Submission` because their ownership is not yet
 * settled (see `@stratamu/submission`), so they stay local to the runtime rather than joining it.
 */
export interface TaskAdmission<W extends Work = Work> extends Submission<W> {
  /** The queue that orders the task. Defaults to the global lane. */
  readonly lane?: LaneId
  /** Labels for cancelling related tasks together. */
  readonly tags?: readonly string[]
  /** Defaults to the lowest priority if not given. The engine decides one either way. */
  readonly priority?: TaskPriority
}
