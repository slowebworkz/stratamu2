import { describe, expect, it } from "vitest"

import { Duration } from "./duration.ts"
import { Instant } from "./instant.ts"

type Pulse = { readonly kind: "pulse" }
type Wall = { readonly kind: "wall" }

describe("Duration", () => {
  it("holds a whole amount", () => {
    expect(Duration.from<Pulse>(12n).value).toBe(12n)
    expect(Duration.from<Pulse>(-3n).value).toBe(-3n)
    expect(Duration.zero<Pulse>().value).toBe(0n)
    expect(Duration.from<Pulse>(12n).toString()).toBe("12")
  })

  it("adds and subtracts, including into negatives", () => {
    const five = Duration.from<Pulse>(5n)
    const two = Duration.from<Pulse>(2n)

    expect(five.add(two).value).toBe(7n)
    expect(five.subtract(two).value).toBe(3n)
    expect(two.subtract(five).value).toBe(-3n)
    expect(five.add(Duration.zero<Pulse>()).value).toBe(5n)
  })

  it("does not change the values it was built from", () => {
    const five = Duration.from<Pulse>(5n)

    five.add(Duration.from<Pulse>(1n))

    expect(five.value).toBe(5n)
  })

  it("stays exact beyond the safe integer range", () => {
    const big = Duration.from<Pulse>(2n ** 70n)

    expect(big.add(Duration.from<Pulse>(1n)).value).toBe(2n ** 70n + 1n)
  })

  it("compares by value", () => {
    const one = Duration.from<Pulse>(1n)
    const two = Duration.from<Pulse>(2n)

    expect(one.compare(two)).toBe(-1)
    expect(two.compare(one)).toBe(1)
    expect(one.compare(Duration.from<Pulse>(1n))).toBe(0)
    expect(one.isBefore(two)).toBe(true)
    expect(two.isAfter(one)).toBe(true)
    expect(one.equals(Duration.from<Pulse>(1n))).toBe(true)
    expect(one.equals(two)).toBe(false)
  })

  it("compares against zero to test its sign", () => {
    expect(Duration.from<Pulse>(-1n).compare(Duration.zero<Pulse>())).toBeLessThan(0)
    expect(Duration.from<Pulse>(1n).compare(Duration.zero<Pulse>())).toBeGreaterThan(0)
  })
})

// The domain parameter must stay invariant. These are checked by `pnpm typecheck`: if one of
// these lines stops being an error, the directive above it fails.
describe("Duration domains", () => {
  const pulses = Duration.from<Pulse>(1n)
  const wall = Duration.from<Wall>(1n)

  it("cannot be mixed or compared across domains", () => {
    // @ts-expect-error a wall-time duration is not a pulse duration
    pulses.add(wall)
    // @ts-expect-error a wall-time duration is not a pulse duration
    pulses.compare(wall)
    // @ts-expect-error a wall-time duration is not a pulse duration
    const asWall: Duration<Wall> = pulses

    expect(asWall).toBeDefined()
  })

  it("cannot be widened to a broader domain", () => {
    // @ts-expect-error Duration<"pulse"> is not a Duration<string>
    const widened: Duration<string> = Duration.from<"pulse">(1n)

    expect(widened).toBeDefined()
  })

  it("is not interchangeable with an Instant of the same domain", () => {
    // @ts-expect-error a point in time is not an amount of time
    const asDuration: Duration<Pulse> = Instant.from<Pulse>(1n)

    expect(asDuration).toBeDefined()
  })
})
