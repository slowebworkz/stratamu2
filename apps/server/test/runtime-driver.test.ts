import type { Clock, MonotonicTime } from "@stratamu/clock"
import type { Runtime } from "@stratamu/engine-core"
import { Instant } from "@stratamu/primitives"
import type { Mock } from "vitest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createRuntimeDriver,
  type RuntimeDriverLog,
  type TickableClock,
} from "../src/runtime-driver.ts"

function fakeRuntime(pumpImpl?: () => Promise<number>) {
  return { pump: vi.fn(pumpImpl ?? (() => Promise.resolve(0))) } as unknown as Runtime
}

function fakeClock(): TickableClock & { readonly ticks: number; readonly calls: number[] } {
  let ticks = 0
  const calls: number[] = []
  return {
    get ticks() {
      return ticks
    },
    calls,
    advance: units => {
      ticks += units
      calls.push(units)
    },
  }
}

/** A controllable monotonic time source, decoupled from vitest's fake timers (which still drive
 * `setTimeout`/`kick` scheduling separately): a test sets elapsed time explicitly with `advance`,
 * rather than inferring it from how many fake-timer callbacks fired. */
function fakeMonotonicClock(
  startMs = 0,
): Clock<Instant<MonotonicTime>> & { advance(ms: number): void } {
  let current = BigInt(startMs)
  return {
    now: () => Instant.from<MonotonicTime>(current),
    advance: ms => {
      current += BigInt(ms)
    },
  }
}

function quietLog(): RuntimeDriverLog & { error: Mock } {
  return { error: vi.fn() }
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

  it("kick() runs an immediate pump without advancing the combat clock", async () => {
    const runtime = fakeRuntime()
    const combatClock = fakeClock()
    const driver = createRuntimeDriver({ runtime, combatClock, tickMs: 1000, stepBudget: 9 })

    driver.start()
    driver.kick()
    await driver.stop()

    expect(runtime.pump).toHaveBeenCalledTimes(1)
    expect(runtime.pump).toHaveBeenCalledWith(9)
    expect(combatClock.ticks).toBe(0)
  })

  it("kick() is a no-op before start()", () => {
    const runtime = fakeRuntime()
    const driver = createRuntimeDriver({ runtime, combatClock: fakeClock() })

    driver.kick()
    expect(runtime.pump).not.toHaveBeenCalled()
  })

  it("kick() is a no-op while a pump is already in flight", async () => {
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

    driver.kick()
    driver.kick()
    expect(runtime.pump).toHaveBeenCalledTimes(1)

    resolvePump?.()
    await driver.stop()
  })

  it("a scheduled tick queues behind a kick-triggered pump still in flight, instead of running concurrently", async () => {
    let resolveKickedPump: (() => void) | undefined
    let calls = 0
    const runtime = fakeRuntime(() => {
      calls++
      if (calls === 1) {
        return new Promise<number>(resolve => {
          resolveKickedPump = () => resolve(0)
        })
      }
      return Promise.resolve(0)
    })
    const combatClock = fakeClock()
    const driver = createRuntimeDriver({ runtime, combatClock, tickMs: 100 })

    driver.start()
    driver.kick()
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.pump).toHaveBeenCalledTimes(1)

    // The scheduled tick comes due while the kicked pump above is still unresolved. Without the
    // fix for this (both paths serialized through one chain), this would start a second,
    // concurrent `runtime.pump()` call right here.
    await vi.advanceTimersByTimeAsync(100)
    expect(runtime.pump).toHaveBeenCalledTimes(1)

    resolveKickedPump?.()
    // Only once the kicked pump finishes does the scheduled tick's own, queued pump get to run.
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.pump).toHaveBeenCalledTimes(2)

    await driver.stop()
  })

  it("stop() also awaits a kick-triggered pump", async () => {
    let resolvePump: (() => void) | undefined
    const runtime = fakeRuntime(
      () =>
        new Promise<number>(resolve => {
          resolvePump = () => resolve(0)
        }),
    )
    const driver = createRuntimeDriver({ runtime, combatClock: fakeClock() })

    driver.start()
    driver.kick()
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.pump).toHaveBeenCalledTimes(1)

    let stopped = false
    const stopping = driver.stop().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)

    resolvePump?.()
    await stopping
    expect(stopped).toBe(true)
  })

  it("advances the combat clock by more than one unit when more than tickMs of monotonic time elapsed", async () => {
    const runtime = fakeRuntime()
    const combatClock = fakeClock()
    const monotonicClock = fakeMonotonicClock(0)
    const driver = createRuntimeDriver({ runtime, combatClock, monotonicClock, tickMs: 100 })

    driver.start()
    // Simulate 2.5x tickMs of real elapsed time passing before the scheduled callback fires --
    // event-loop lag, a slow pump, a GC pause -- not just the nominal 100ms the timer itself waited.
    monotonicClock.advance(250)
    await vi.advanceTimersByTimeAsync(100)
    expect(combatClock.calls).toEqual([2])

    await driver.stop()
  })

  it("after a tick catches up on lag, the next normal tick credits one unit again, not zero or double", async () => {
    const runtime = fakeRuntime()
    const combatClock = fakeClock()
    const monotonicClock = fakeMonotonicClock(0)
    const driver = createRuntimeDriver({ runtime, combatClock, monotonicClock, tickMs: 100 })

    driver.start()
    monotonicClock.advance(250)
    await vi.advanceTimersByTimeAsync(100)
    expect(combatClock.calls).toEqual([2])

    // Only one more tickMs of real time passes normally; the 50ms left over from the catch-up
    // tick above must still be remembered, not rounded away -- but it also must not be
    // double-credited into this tick.
    monotonicClock.advance(100)
    await vi.advanceTimersByTimeAsync(100)
    expect(combatClock.calls).toEqual([2, 1])

    await driver.stop()
  })

  it("logs and recovers when a scheduled tick's pump fails, continuing to tick afterward", async () => {
    let shouldFail = true
    const runtime = fakeRuntime(() => {
      if (shouldFail) {
        shouldFail = false
        return Promise.reject(new Error("boom"))
      }
      return Promise.resolve(0)
    })
    const combatClock = fakeClock()
    const log = quietLog()
    const driver = createRuntimeDriver({ runtime, combatClock, tickMs: 100, log })

    driver.start()
    await vi.advanceTimersByTimeAsync(100)
    expect(log.error).toHaveBeenCalledWith("Runtime pump failed", expect.any(Error))
    expect(combatClock.ticks).toBe(1)

    await vi.advanceTimersByTimeAsync(100)
    expect(runtime.pump).toHaveBeenCalledTimes(2)
    expect(combatClock.ticks).toBe(2)

    await driver.stop()
  })

  it("logs and recovers when a scheduled tick's combatClock.advance() throws", async () => {
    const runtime = fakeRuntime()
    let shouldThrow = true
    const combatClock: TickableClock = {
      advance: () => {
        if (shouldThrow) {
          shouldThrow = false
          throw new Error("clock boom")
        }
      },
    }
    const log = quietLog()
    const driver = createRuntimeDriver({ runtime, combatClock, tickMs: 100, log })

    driver.start()
    await vi.advanceTimersByTimeAsync(100)
    expect(log.error).toHaveBeenCalledWith("Combat clock advance failed", expect.any(Error))
    // A clock failure isn't fatal to running already-ready work: pump still ran.
    expect(runtime.pump).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(100)
    expect(runtime.pump).toHaveBeenCalledTimes(2)

    await driver.stop()
  })

  it("preserves elapsed time for retry when combatClock.advance() throws, rather than discarding it", async () => {
    const runtime = fakeRuntime()
    let shouldThrow = true
    const calls: number[] = []
    const combatClock: TickableClock = {
      advance: units => {
        if (shouldThrow) {
          shouldThrow = false
          throw new Error("clock boom")
        }
        calls.push(units)
      },
    }
    const monotonicClock = fakeMonotonicClock(0)
    const log = quietLog()
    const driver = createRuntimeDriver({ runtime, combatClock, monotonicClock, tickMs: 100, log })

    driver.start()
    monotonicClock.advance(100)
    await vi.advanceTimersByTimeAsync(100)
    expect(log.error).toHaveBeenCalledWith("Combat clock advance failed", expect.any(Error))
    // The failed attempt never got to record a unit, and must not have silently moved past it.
    expect(calls).toEqual([])

    // A further 100ms of real time passes before the next tick fires.
    monotonicClock.advance(100)
    await vi.advanceTimersByTimeAsync(100)
    // If the first tick's elapsed time had been discarded, this would only credit 1 unit. It
    // credits 2: the unit the failed attempt never recorded, plus this tick's own.
    expect(calls).toEqual([2])

    await driver.stop()
  })

  it("logs a kick-triggered pump failure without throwing", async () => {
    const runtime = fakeRuntime(() => Promise.reject(new Error("boom")))
    const log = quietLog()
    const driver = createRuntimeDriver({ runtime, combatClock: fakeClock(), log })

    driver.start()
    driver.kick()
    await driver.stop()
    expect(log.error).toHaveBeenCalledWith("Runtime pump failed", expect.any(Error))
  })
})
