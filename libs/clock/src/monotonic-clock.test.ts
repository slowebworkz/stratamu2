import { Duration, Instant } from "@stratamu/primitives"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MonotonicClock } from "./monotonic-clock.ts"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("MonotonicClock", () => {
  it("reads the platform's monotonic timer in whole milliseconds", () => {
    vi.spyOn(performance, "now").mockReturnValue(1234.9)

    const reading = new MonotonicClock().now()

    expect(reading).toBeInstanceOf(Instant)
    expect(reading.value).toBe(1234n)
  })

  it("floors to whole milliseconds, which is its resolution", () => {
    const now = vi.spyOn(performance, "now")

    now.mockReturnValue(10.0)
    expect(new MonotonicClock().now().value).toBe(10n)
    now.mockReturnValue(10.999)
    expect(new MonotonicClock().now().value).toBe(10n)
    now.mockReturnValue(11.0)
    expect(new MonotonicClock().now().value).toBe(11n)
  })

  it("is not interchangeable with an instant in another domain", () => {
    type Pulse = { readonly kind: "pulse" }
    const reading = new MonotonicClock().now()

    // @ts-expect-error a monotonic reading is not a pulse instant
    const asPulse: Instant<Pulse> = reading
    // @ts-expect-error a pulse duration cannot move a monotonic reading
    reading.add(Duration.from<Pulse>(1n))

    expect(asPulse).toBeDefined()
  })

  it("never decreases", () => {
    const clock = new MonotonicClock()
    let previous = clock.now().value

    for (let i = 0; i < 100; i++) {
      const current = clock.now().value

      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })
})
