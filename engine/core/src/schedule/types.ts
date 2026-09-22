import type { ClockId } from "../clock/index.ts"

export interface ImmediateSchedule {
  readonly kind: "now"
}

export interface RelativeSchedule {
  readonly kind: "after"
  readonly delay: number
  readonly clock: ClockId
}

export interface AbsoluteSchedule {
  readonly kind: "at"
  readonly time: number
  readonly clock: ClockId
}

/**
 * A one-time instruction for when an admitted task first becomes eligible: temporal eligibility,
 * resolved once against a named clock. It answers "when should this become eligible", not "what
 * caused it to be submitted" (that is a `Source`/`Event`, outside this substrate) and not "what
 * should happen" (that is `Work`/`Submission`). The same `Submission` could be admitted `now`,
 * `after` a delay, or `at` an absolute time without changing the work at all.
 *
 * A `Schedule` does not survive admission: it is resolved once, and only its outcome (`ready` or
 * `pending` with a `via`) is kept on the `TaskRecord`. It is unrelated to `wake`, which returns an
 * already-admitted, waiting task to ready: that is logical eligibility, not temporal, and has no
 * clock involved.
 */
export type Schedule = ImmediateSchedule | RelativeSchedule | AbsoluteSchedule
