import type { ExceptionalError } from "@stratamu/capabilities"

/**
 * The outcome of a child process's lifecycle, as a discriminated result rather than a thrown
 * error for an expected alternate outcome -- the same convention
 * `engine/core/src/runtime/runtime.ts`'s `TaskOutcome` already uses. `error` is present only when
 * `state` is `"failed"`.
 */
export interface ProcessResult {
  readonly id: string
  readonly state: "completed" | "failed" | "cancelled" | "timed-out"
  readonly exitCode: number | undefined
  readonly signal: NodeJS.Signals | undefined
  readonly stdout: string
  readonly stderr: string
  readonly stdoutTruncated: boolean
  readonly stderrTruncated: boolean
  readonly error?: ExceptionalError
}
