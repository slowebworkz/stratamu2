import type { ClockId } from "../clock/index.ts"
import type { Trigger } from "./types.ts"

export const trigger = {
  /** Ready immediately, behind whatever is already ready. */
  now: { kind: "now" } as const satisfies Trigger,
  /** Ready `n` units from the clock's current time. */
  after: (n: number, clock: ClockId): Trigger => ({ kind: "after", n, clock }),
  /** Ready when the clock reaches `t`, or immediately if it already has. */
  at: (t: number, clock: ClockId): Trigger => ({ kind: "at", t, clock }),
}
