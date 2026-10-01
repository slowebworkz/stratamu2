import type { Runtime } from "@stratamu/engine-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createRuntimeDriver, type TickableClock } from "../src/runtime-driver.ts"

function fakeRuntime(pumpImpl?: () => Promise<number>) {
  return { pump: vi.fn(pumpImpl ?? (() => Promise.resolve(0))) } as unknown as Runtime
}

function fakeClock(): TickableClock & { readonly ticks: number } {
  let ticks = 0
  return {
    get ticks() {
      return ticks
    },
    advance: () => {
      ticks++
    },
  }
}

describe("createRuntimeDriver", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("advances the combat clock and pumps the runtime once per tick", async () => {
    const runtime = fakeRuntime()
    const combatClock = fakeClock()
    const driver = createRuntimeDriver({ runtime, combatClock, tickMs: 100, stepBudget: 7 })

    driver.start()
    await vi.advanceTimersByTimeAsync(100)
    expect(combatClock.ticks).toBe(1)
    expect(runtime.pump).toHaveBeenNthCalledWith(1, 7)

    await vi.advanceTimersByTimeAsync(100)
    expect(combatClock.ticks).toBe(2)
    expect(runtime.pump).toHaveBeenNthCalledWith(2, 7)

    await driver.stop()
  })

  it("does not tick before start, and stops scheduling further ticks once stopped", async () => {
    const runtime = fakeRuntime()
    const combatClock = fakeClock()
    const driver = createRuntimeDriver({ runtime, combatClock, tickMs: 100 })

    await vi.advanceTimersByTimeAsync(300)
    expect(combatClock.ticks).toBe(0)

    driver.start()
    await vi.advanceTimersByTimeAsync(100)
    expect(combatClock.ticks).toBe(1)

    await driver.stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(combatClock.ticks).toBe(1)
  })

  it("throws if started twice", () => {
    const driver = createRuntimeDriver({ runtime: fakeRuntime(), combatClock: fakeClock() })
    driver.start()
    expect(() => driver.start()).toThrow()
  })

  it("stop() is safe to call before start() or more than once", async () => {
    const driver = createRuntimeDriver({ runtime: fakeRuntime(), combatClock: fakeClock() })
    await driver.stop()
    driver.start()
    await driver.stop()
    await driver.stop()
  })

  it("stop() awaits an in-flight tick's pump before resolving", async () => {
    let resolvePump: (() => void) | undefined
    const runtime = fakeRuntime(
      () =>
        new Promise<number>(resolve => {
          resolvePump = () => resolve(0)
        }),
    )
    const combatClock = fakeClock()
    const driver = createRuntimeDriver({ runtime, combatClock, tickMs: 100 })

    driver.start()
    await vi.advanceTimersByTimeAsync(100)
    expect(runtime.pump).toHaveBeenCalledTimes(1)

    let stopped = false
    const stopping = driver.stop().then(() => {
      stopped = true
    })
    // The tick's pump() is still pending, so stop() must not have resolved yet.
    await Promise.resolve()
    expect(stopped).toBe(false)

    resolvePump?.()
    await stopping
    expect(stopped).toBe(true)
  })
})
