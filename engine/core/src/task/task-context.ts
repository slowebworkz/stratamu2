import type { Sessions } from "@stratamu/engine-sessions"
import type { WorldState } from "@stratamu/engine-world"

import type { TaskAdmission } from "./task-admission.ts"
import type { TaskOutcome } from "./task-outcome.ts"

export interface TaskContext {
  /** Aborted when the task is cancelled. */
  readonly signal: AbortSignal
  /** What the task suspended with, when it runs again after being woken. Otherwise undefined. */
  readonly continuation: unknown
  /**
   * The authoritative world the engine is executing against, if the `Runtime` was given an
   * `EngineState`. Undefined for a `Runtime` constructed without one, such as most of this
   * package's own tests: `Runtime` has no opinion about game state, so it is entirely optional.
   * `Runtime` threads it through without reading or interpreting it; only a handler does that.
   */
  readonly world: WorldState | undefined
  /**
   * Which sessions are currently active, if the `Runtime`'s `EngineState` was given one.
   * Undefined both when there is no `EngineState` at all and when that `EngineState` has no
   * `sessions` -- the same optionality `EngineState.sessions` itself has, threaded through
   * unread, the same as `world`. See `@stratamu/engine-sessions` for what `Sessions` tracks, and
   * `@stratamu/adapter-test`'s `src/probes/session-lifecycle.test.ts` for a handler reading it.
   */
  readonly sessions: Sessions | undefined
  /**
   * Runs a task inline, as part of the current step, without queueing it. An inline task cannot
   * suspend or reschedule, because there is nothing for it to wait inside of: it fails if it
   * tries.
   */
  run(admission: TaskAdmission): Promise<TaskOutcome>
}
