import { describe, expect, it } from "vitest"

import { Duration } from "./duration.ts"
import { Instant } from "./instant.ts"

type Pulse = { readonly kind: "pulse" }
type Wall = { readonly kind: "wall" }

describe("Instant", () => {
  it("holds a point in its domain", () => {
    expect(Instant.from<Pulse>(100n).value).toBe(100n)
    expect(Instant.zero<Pulse>().value).toBe(0n)
    expect(Instant.from<Pulse>(100n).toString()).toBe("100")
  })

  it("moves by a duration of the same domain", () => {
    const at = Instant.from<Pulse>(100n)
    const step = Duration.from<Pulse>(30n)

    expect(at.add(step).value).toBe(130n)
    expect(at.subtract(step).value).toBe(70n)
    expect(at.value).toBe(100n)
  })

  it("measures the duration between two instants", () => {
    const start = Instant.from<Pulse>(100n)
    const end = Instant.from<Pulse>(130n)

    expect(end.durationSince(start).value).toBe(30n)
    expect(start.durationSince(end).value).toBe(-30n)
    expect(start.add(end.durationSince(start)).equals(end)).toBe(true)
  })

  it("compares by value", () => {
    const early = Instant.from<Pulse>(1n)
    const late = Instant.from<Pulse>(2n)

    expect(early.compare(late)).toBe(-1)
    expect(late.compare(early)).toBe(1)
    expect(early.isBefore(late)).toBe(true)
    expect(late.isAfter(early)).toBe(true)
    expect(early.equals(Instant.from<Pulse>(1n))).toBe(true)
    expect(early.isAfter(late)).toBe(false)
  })
})

// Checked by `pnpm typecheck`, like the domain tests for Duration.
describe("Instant domains", () => {
  const pulse = Instant.from<Pulse>(1n)
  const wall = Instant.from<Wall>(1n)

  it("cannot be compared or measured across domains", () => {
    // @ts-expect-error a wall-time instant is not a pulse instant
    pulse.compare(wall)
    // @ts-expect-error a wall-time instant is not a pulse instant
    pulse.durationSince(wall)
    // @ts-expect-error a wall-time instant is not a pulse instant
    const asWall: Instant<Wall> = pulse

    expect(asWall).toBeDefined()
  })

  it("cannot move by a duration of another domain", () => {
    // @ts-expect-error a wall-time duration cannot move a pulse instant
    pulse.add(Duration.from<Wall>(1n))
    // @ts-expect-error a wall-time duration cannot move a pulse instant
    pulse.subtract(Duration.from<Wall>(1n))

    expect(pulse.value).toBe(1n)
  })
})
