import { Timestamp } from "@stratamu/primitives"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WallClock } from "./wall-clock.ts"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("WallClock", () => {
  it("reads the system time as a Timestamp", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_123)

    const reading = new WallClock().now()

    expect(reading).toBeInstanceOf(Timestamp)
    expect(reading.milliseconds).toBe(1_700_000_000_123n)
    expect(reading.toISOString()).toBe("2023-11-14T22:13:20.123Z")
  })

  it("reads the system time on every call", () => {
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(500)
    const clock = new WallClock()

    expect(clock.now().milliseconds).toBe(1000n)
    // The system time can be set backwards, and the clock reports it as it is.
    expect(clock.now().milliseconds).toBe(500n)
    expect(now).toHaveBeenCalledTimes(2)
  })
})
