import type { ClockId } from "../clock/index.ts"
import type { AbsoluteSchedule, ImmediateSchedule, RelativeSchedule } from "./types.ts"

export const schedule = {
  /** Eligible immediately, behind whatever is already ready. */
  now: { kind: "now" } as const satisfies ImmediateSchedule,
  /** Eligible `delay` units from the clock's current time. */
  after: (delay: number, clock: ClockId): RelativeSchedule => ({
    kind: "after",
    delay,
    clock,
  }),
  /** Eligible when the clock reaches `time`, or immediately if it already has. */
  at: (time: number, clock: ClockId): AbsoluteSchedule => ({
    kind: "at",
    time,
    clock,
  }),
}
