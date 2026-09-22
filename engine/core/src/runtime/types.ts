import type { ExecutionPolicy } from "../policy/index.ts"

export interface RuntimeOptions {
  /** Decides which ready task runs next. Defaults to `oldestReady()`. */
  readonly policy?: ExecutionPolicy
}
