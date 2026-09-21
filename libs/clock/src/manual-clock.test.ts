import { Duration, Instant } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import type { Clock } from "./clock.ts"
import { ManualClock } from "./manual-clock.ts"

type Pulse = { readonly kind: "pulse" }
type Wall = { readonly kind: "wall" }

const pulses = (n: bigint) => Duration.from<Pulse>(n)
const clockAt = (n: bigint) => new ManualClock(Instant.from<Pulse>(n))

describe("ManualClock", () => {
  it("starts at the instant it is given", () => {
    expect(clockAt(0n).now().value).toBe(0n)
    expect(clockAt(40n).now().value).toBe(40n)
  })

  it("moves only when advanced", () => {
    const clock = clockAt(0n)

    expect(clock.now().value).toBe(0n)
    clock.advance(pulses(5n))
    clock.advance(pulses(2n))

    expect(clock.now().value).toBe(7n)
  })

  it("allows advancing by zero", () => {
    const clock = clockAt(3n)

    clock.advance(Duration.zero<Pulse>())

    expect(clock.now().value).toBe(3n)
  })

  it("cannot move backwards", () => {
    const clock = clockAt(3n)

    expect(() => clock.advance(pulses(-1n))).toThrow(RangeError)
    expect(clock.now().value).toBe(3n)
  })

  it("does not change readings it has already given out", () => {
    const clock = clockAt(0n)
    const before = clock.now()

    clock.advance(pulses(9n))

    expect(before.value).toBe(0n)
  })

  it("is a Clock of instants in its domain", () => {
    const clock: Clock<Instant<Pulse>> = clockAt(0n)

    expect(clock.now()).toBeInstanceOf(Instant)
  })

  it("infers its domain from the instant it starts at", () => {
    const clock = new ManualClock(Instant.from<Pulse>(0n))

    clock.advance(Duration.from<Pulse>(10n))

    expect(clock.now().value).toBe(10n)
  })
})

// Checked by `pnpm typecheck`: if one of these lines stops being an error, its directive fails.
describe("ManualClock domains", () => {
  it("cannot be advanced by, or started from, another domain", () => {
    const clock = clockAt(0n)

    // @ts-expect-error a wall-time duration cannot advance a pulse clock
    clock.advance(Duration.from<Wall>(1n))
    // @ts-expect-error a wall-time instant cannot start a pulse clock
    new ManualClock<Pulse>(Instant.from<Wall>(1n))
    // @ts-expect-error a pulse clock is not a wall-time clock
    const asWall: Clock<Instant<Wall>> = clock

    expect(asWall).toBeDefined()
  })
})
