/**
 * Where a managed execution currently stands. Shared vocabulary for both execution mechanisms this
 * package will eventually provide (child processes now, a worker pool later), not specific to
 * either one.
 *
 * A nonzero exit code is still `"completed"`: the process ran to completion, and the code is data
 * on its result, not an exceptional outcome. `"failed"` means it never successfully started.
 * `"cancelled"`/`"timed-out"` are reported only when this library's own cancellation/timeout
 * mechanism ended the execution -- an explicit caller-initiated stop just reports what actually
 * happened to the process.
 */
export type ProcessState =
  | "starting"
  | "running"
  | "stopping"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed-out"

/**
 * Cancellation and timeout are first-class lifecycle inputs, not an afterthought layered on top:
 * both `signal` and `timeoutMs` end an execution the same way an explicit `stop()` does (graceful
 * signal, then escalation), just for a different reason.
 */
export interface ExecutionOptions {
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  /** The grace period between the graceful signal and escalating to a forced kill, when
   * cancellation or `timeoutMs` itself ends the execution. Separate from `StopOptions.timeoutMs`,
   * which only applies to an explicit `stop()` call. */
  readonly stopTimeoutMs?: number
}
