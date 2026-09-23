import type { EngineState } from "@stratamu/engine-world"

import type { ExecutionPolicy } from "../policy/index.ts"

export interface RuntimeOptions {
  /** Decides which ready task runs next. Defaults to `oldestReady()`. */
  readonly policy?: ExecutionPolicy
  /**
   * What the engine is executing against. Optional: a `Runtime` has no opinion about game state,
   * so it works without one, and most of this package's own tests do not give it one. When given,
   * its `world` is threaded through to every `TaskContext`, unread and uninterpreted by `Runtime`
   * itself.
   */
  readonly engineState?: EngineState
}
