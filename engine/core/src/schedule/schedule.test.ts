import { describe, expect, expectTypeOf, it } from "vitest"

import { schedule } from "./schedule.ts"
import type { AbsoluteSchedule, ImmediateSchedule, RelativeSchedule, Schedule } from "./types.ts"

describe("schedule.now", () => {
  it("is an ImmediateSchedule", () => {
    expect(schedule.now).toEqual({ kind: "now" })
    expectTypeOf(schedule.now).toEqualTypeOf<ImmediateSchedule>()
  })
})

describe("schedule.after", () => {
  it("builds a RelativeSchedule from a delay and a clock", () => {
    const s = schedule.after(10, "time")

    expect(s).toEqual({ kind: "after", delay: 10, clock: "time" })
    expectTypeOf(s).toEqualTypeOf<RelativeSchedule>()
  })

  it("does not validate the delay itself: that is the runtime's job when it resolves", () => {
    expect(schedule.after(-1, "time")).toEqual({ kind: "after", delay: -1, clock: "time" })
  })
})

describe("schedule.at", () => {
  it("builds an AbsoluteSchedule from a time and a clock", () => {
    const s = schedule.at(50, "time")

    expect(s).toEqual({ kind: "at", time: 50, clock: "time" })
    expectTypeOf(s).toEqualTypeOf<AbsoluteSchedule>()
  })
})

describe("Schedule", () => {
  it("is exactly the union of the three shapes", () => {
    expectTypeOf<Schedule>().toEqualTypeOf<
      ImmediateSchedule | RelativeSchedule | AbsoluteSchedule
    >()
  })

  // Checked by `pnpm typecheck`: if narrowing stops working, these directives fail.
  it("narrows on kind, so each branch sees only its own fields", () => {
    function describeSchedule(s: Schedule): string {
      switch (s.kind) {
        case "now":
          // @ts-expect-error an ImmediateSchedule has no delay
          return String(s.delay)
        case "after":
          return `${s.delay} on ${s.clock}`
        case "at":
          return `${s.time} on ${s.clock}`
      }
    }

    expect(describeSchedule(schedule.now)).toBe("undefined")
    expect(describeSchedule(schedule.after(10, "time"))).toBe("10 on time")
    expect(describeSchedule(schedule.at(50, "time"))).toBe("50 on time")
  })

  it("does not accept one shape's fields on another", () => {
    // @ts-expect-error an ImmediateSchedule cannot carry a clock
    const bad: ImmediateSchedule = schedule.after(10, "time")

    expect(bad).toBeDefined()
  })
})
