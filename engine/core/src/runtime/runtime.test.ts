import { PinoLogger, setRootLogger } from "@stratamu/capabilities"
import type { Clock } from "@stratamu/clock"
import { ManualClock, WallClock } from "@stratamu/clock"
import type { TaskId } from "@stratamu/primitives"
import { Duration, Instant, taskId, taskPriority } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import type { ExecutionPolicy, ReadyLane, ReadyTask } from "../policy/index.ts"
import { oldestReady } from "../policy/index.ts"
import { schedule } from "../schedule/index.ts"
import type { Task, TaskContext } from "../task/index.ts"
import { reschedule, suspend } from "../task/index.ts"
import { Runtime } from "./runtime.ts"

/** Test kinds live under one namespace, as real ones live under their family's. */
const k = (name: string) => workKind(`test.${name}`)

type Ticks = { readonly kind: "ticks" }

/** A manual clock that can be moved by a plain number of ticks. */
function testClock() {
  const clock = new ManualClock(Instant.from<Ticks>(0n))
  return Object.assign(clock, {
    tick: (n: number) => clock.advance(Duration.from<Ticks>(BigInt(n))),
  })
}

beforeAll(() => {
  setRootLogger(PinoLogger.create({ level: "silent" }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

function setup(policy?: ExecutionPolicy) {
  const runtime = new Runtime(policy ? { policy } : {})
  const clock = testClock()
  runtime.attachClock("time", clock)
  const seen: string[] = []
  runtime.handle(k("say"), task => {
    seen.push(String(task.work.input))
  })
  const say = (payload: string, extra: { lane?: string; tags?: string[] } = {}) => ({
    work: work(k("say"), payload),
    ...extra,
  })
  return { runtime, clock, seen, say }
}

describe("admission", () => {
  it("assigns the lowest priority to a task submitted without one", async () => {
    const { runtime } = setup()
    const priorities: unknown[] = []
    runtime.handle(k("check"), task => {
      priorities.push(task.priority)
    })

    runtime.submit({ work: work(k("check"), undefined) })
    await runtime.drain()

    expect(priorities).toEqual([taskPriority(0)])
  })

  it("assigns the priority it is given", async () => {
    const { runtime } = setup()
    const priorities: unknown[] = []
    runtime.handle(k("check"), task => {
      priorities.push(task.priority)
    })

    runtime.submit({ work: work(k("check"), undefined), priority: taskPriority(5) })
    await runtime.drain()

    expect(priorities).toEqual([taskPriority(5)])
  })

  it("gives every task its own identity and place in creation order", async () => {
    const { runtime } = setup()
    const seen: { id: string; sequence: number }[] = []
    runtime.handle(k("check"), task => {
      seen.push({ id: task.id, sequence: task.sequence })
    })

    runtime.submit({ work: work(k("check"), undefined) })
    runtime.submit({ work: work(k("check"), undefined) })
    await runtime.drain()

    expect(seen[0]?.id).not.toBe(seen[1]?.id)
    expect(seen[1]?.sequence).toBeGreaterThan(seen[0]?.sequence ?? -1)
  })
})

describe("queued execution", () => {
  it("runs ready tasks in the order they were submitted", async () => {
    const { runtime, seen, say } = setup()
    runtime.submit(say("one"))
    runtime.submit(say("two"))
    runtime.submit(say("three"))

    expect(await runtime.drain()).toBe(3)

    expect(seen).toEqual(["one", "two", "three"])
    expect(runtime.pending).toBe(0)
  })

  it("does nothing when nothing is ready", async () => {
    const { runtime } = setup()

    expect(await runtime.drain()).toBe(0)
  })

  it("runs a task submitted during a step in the same drain, behind what is already ready", async () => {
    const { runtime, seen, say } = setup()
    runtime.handle(k("spawn"), () => {
      seen.push("spawn")
      runtime.submit(say("child"))
    })
    runtime.submit({ work: work(k("spawn"), undefined) })
    runtime.submit(say("sibling"))

    await runtime.drain()

    expect(seen).toEqual(["spawn", "sibling", "child"])
  })

  it("awaits each async handler before starting the next", async () => {
    const { runtime, seen, say } = setup()
    runtime.handle(k("slow"), async () => {
      seen.push("slow:start")
      await new Promise(resolve => setImmediate(resolve))
      seen.push("slow:end")
    })
    runtime.submit({ work: work(k("slow"), undefined) })
    runtime.submit(say("after"))

    await runtime.drain()

    expect(seen).toEqual(["slow:start", "slow:end", "after"])
  })

  it("refuses to run a step inside a step", async () => {
    const { runtime } = setup()
    runtime.handle(k("nested"), async () => {
      await runtime.drain()
    })
    const handle = runtime.submit({ work: work(k("nested"), undefined) })

    await runtime.drain()

    const outcome = await handle.settled
    expect(outcome).toMatchObject({ state: "failed" })
    expect(String((outcome as { error: unknown }).error)).toContain("already executing a step")
  })
})

describe("immediate execution", () => {
  it("runs a task inline, before the rest of the step and ahead of queued work", async () => {
    const { runtime, seen, say } = setup()
    runtime.handle(k("force"), async (_task, context) => {
      seen.push("before")
      await context.run(say("forced"))
      seen.push("after")
    })
    runtime.submit({ work: work(k("force"), undefined) })
    runtime.submit(say("queued"))

    await runtime.drain()

    expect(seen).toEqual(["before", "forced", "after", "queued"])
  })

  it("reports the outcome of an inline task to its caller", async () => {
    const { runtime } = setup()
    const error = new Error("inline bug")
    runtime.handle(k("bad"), () => {
      throw error
    })
    const outcomes: unknown[] = []
    runtime.handle(k("force"), async (_task, context) => {
      outcomes.push(await context.run({ work: work(k("bad"), undefined) }))
    })
    runtime.submit({ work: work(k("force"), undefined) })

    await runtime.drain()

    expect(outcomes).toEqual([{ state: "failed", error }])
  })
})

describe("delayed and scheduled execution", () => {
  it("holds a delayed task until its clock reaches it", async () => {
    const { runtime, clock, seen, say } = setup()
    const handle = runtime.submit(say("later"), schedule.after(10, "time"))

    expect(handle.state).toBe("pending")
    clock.tick(9)
    await runtime.drain()
    expect(seen).toEqual([])

    clock.tick(1)
    await runtime.drain()
    expect(seen).toEqual(["later"])
    expect(handle.state).toBe("completed")
  })

  it("runs a task scheduled for an absolute time when the clock gets there", async () => {
    const { runtime, clock, seen, say } = setup()
    runtime.submit(say("at 50"), schedule.at(50, "time"))

    clock.tick(49)
    await runtime.drain()
    clock.tick(1)
    await runtime.drain()

    expect(seen).toEqual(["at 50"])
  })

  it("makes a task whose time has already passed ready immediately", async () => {
    const { runtime, clock, say } = setup()
    clock.tick(100)

    const late = runtime.submit(say("late"), schedule.at(50, "time"))
    const zero = runtime.submit(say("zero"), schedule.after(0, "time"))

    expect(late.state).toBe("ready")
    expect(zero.state).toBe("ready")
  })

  it("orders delayed tasks by due time, then by submission", async () => {
    const { runtime, clock, seen, say } = setup()
    runtime.submit(say("c"), schedule.after(20, "time"))
    runtime.submit(say("a"), schedule.after(10, "time"))
    runtime.submit(say("b"), schedule.after(10, "time"))

    clock.tick(20)
    await runtime.drain()

    expect(seen).toEqual(["a", "b", "c"])
  })

  it("orders a task by when it became ready, not when it was submitted", async () => {
    const { runtime, clock, seen, say } = setup()
    runtime.submit(say("delayed"), schedule.after(5, "time"))
    runtime.submit(say("queued"))
    clock.tick(5)

    await runtime.drain()

    expect(seen).toEqual(["queued", "delayed"])
  })

  it("makes tasks that came due ready before a task submitted afterwards", async () => {
    const { runtime, clock, seen, say } = setup()
    runtime.submit(say("delayed"), schedule.after(5, "time"))
    clock.tick(5)
    runtime.submit(say("fresh"))

    await runtime.drain()

    expect(seen).toEqual(["delayed", "fresh"])
  })

  it("releases due tasks when a handler advances a clock", async () => {
    const { runtime, clock, seen, say } = setup()
    runtime.handle(k("end-round"), () => {
      clock.tick(1)
    })
    runtime.submit(say("next round"), schedule.after(1, "time"))
    runtime.submit({ work: work(k("end-round"), undefined) })

    await runtime.drain()

    expect(seen).toEqual(["next round"])
  })

  it("keeps clocks independent", async () => {
    const { runtime, clock, seen, say } = setup()
    const turns = testClock()
    runtime.attachClock("turns", turns)
    runtime.submit(say("on time"), schedule.after(1, "time"))
    runtime.submit(say("on turns"), schedule.after(1, "turns"))

    clock.tick(1)
    await runtime.drain()
    expect(seen).toEqual(["on time"])

    turns.tick(1)
    await runtime.drain()
    expect(seen).toEqual(["on time", "on turns"])
  })

  it("rejects an unknown clock or an invalid time without consuming a task id", () => {
    const { runtime, say } = setup()

    expect(() => runtime.submit(say("x"), schedule.after(1, "nope"))).toThrow(
      'Unknown clock "nope"',
    )
    expect(() => runtime.submit(say("x"), schedule.after(-1, "time"))).toThrow(RangeError)
    expect(() => runtime.submit(say("x"), schedule.after(Number.NaN, "time"))).toThrow(RangeError)
    expect(() => runtime.submit(say("x"), schedule.at(Number.POSITIVE_INFINITY, "time"))).toThrow(
      RangeError,
    )
    expect(runtime.submit(say("x")).id).toBe(taskId("task-0"))
  })

  it("attaches each clock once", () => {
    const { runtime } = setup()

    expect(() => runtime.attachClock("time", testClock())).toThrow("already attached")
  })
})

describe("lanes", () => {
  it("keeps first-in, first-out order within a lane and across lanes by readiness", async () => {
    const { runtime, seen, say } = setup()
    runtime.submit(say("a1", { lane: "a" }))
    runtime.submit(say("b1", { lane: "b" }))
    runtime.submit(say("a2", { lane: "a" }))
    runtime.submit(say("g1"))

    await runtime.drain()

    expect(seen).toEqual(["a1", "b1", "a2", "g1"])
  })

  it("cancels everything in one lane and leaves the rest", async () => {
    const { runtime, clock, seen, say } = setup()
    runtime.submit(say("mine", { lane: "session-1" }))
    runtime.submit(say("mine, delayed", { lane: "session-1" }), schedule.after(5, "time"))
    runtime.submit(say("theirs", { lane: "session-2" }))

    expect(runtime.cancelLane("session-1", "disconnected")).toBe(2)
    clock.tick(5)
    await runtime.drain()

    expect(seen).toEqual(["theirs"])
    expect(runtime.pending).toBe(0)
  })

  it("cancels by tag", async () => {
    const { runtime, seen, say } = setup()
    runtime.submit(say("poison", { tags: ["combat"] }))
    runtime.submit(say("heal", { tags: ["combat", "magic"] }))
    runtime.submit(say("chat", { tags: ["social"] }))

    expect(runtime.cancelTag("combat")).toBe(2)
    await runtime.drain()

    expect(seen).toEqual(["chat"])
  })
})

describe("cancellation", () => {
  it("cancels a ready task", async () => {
    const { runtime, seen, say } = setup()
    const handle = runtime.submit(say("never"))

    expect(handle.cancel("changed my mind")).toBe(true)

    expect(handle.state).toBe("cancelled")
    expect(await handle.settled).toEqual({ state: "cancelled", reason: "changed my mind" })
    await runtime.drain()
    expect(seen).toEqual([])
  })

  it("cancels a scheduled task so it never becomes ready", async () => {
    const { runtime, clock, seen, say } = setup()
    const handle = runtime.submit(say("never"), schedule.after(5, "time"))

    handle.cancel()
    clock.tick(5)
    await runtime.drain()

    expect(handle.state).toBe("cancelled")
    expect(seen).toEqual([])
  })

  it("aborts a running task's signal and ends it as cancelled once the step returns", async () => {
    const { runtime } = setup()
    let aborted = false
    let release: () => void = () => {}
    runtime.handle(k("long"), async (_task, context) => {
      await new Promise<void>(resolve => {
        release = resolve
      })
      aborted = context.signal.aborted
    })
    const handle = runtime.submit({ work: work(k("long"), undefined) })
    const drained = runtime.drain()
    await new Promise(resolve => setImmediate(resolve))

    expect(handle.state).toBe("running")
    expect(handle.cancel("stop")).toBe(true)
    expect(handle.cancel("stop again")).toBe(false)
    release()
    await drained

    expect(aborted).toBe(true)
    expect(await handle.settled).toEqual({ state: "cancelled", reason: "stop" })
  })

  it("does not cancel a task that has finished", async () => {
    const { runtime, say } = setup()
    const handle = runtime.submit(say("completed"))
    await runtime.drain()

    expect(handle.cancel()).toBe(false)
    expect(handle.state).toBe("completed")
  })

  it("uses an abort error as the reason when none is given", async () => {
    const { runtime, say } = setup()
    const handle = runtime.submit(say("x"))

    handle.cancel()

    const outcome = await handle.settled
    expect(outcome).toMatchObject({ state: "cancelled" })
    expect((outcome as { reason: Error }).reason.name).toBe("AbortError")
  })
})

describe("failure", () => {
  it("contains a throwing handler and keeps running the rest", async () => {
    const { runtime, seen, say } = setup()
    const error = new Error("handler bug")
    runtime.handle(k("bad"), () => {
      throw error
    })
    const bad = runtime.submit({ work: work(k("bad"), undefined) })
    runtime.submit(say("good"))

    await runtime.drain()

    expect(await bad.settled).toEqual({ state: "failed", error })
    expect(bad.state).toBe("failed")
    expect(seen).toEqual(["good"])
  })

  it("fails a task with no handler", async () => {
    const { runtime } = setup()
    const handle = runtime.submit({ work: work(k("unknown"), undefined) })

    await runtime.drain()

    const outcome = await handle.settled
    expect(outcome).toMatchObject({ state: "failed" })
    expect(String((outcome as { error: unknown }).error)).toContain('"test.unknown"')
  })

  it("allows one handler per task type", () => {
    const { runtime } = setup()

    expect(() => runtime.handle(k("say"), () => {})).toThrow("already registered")
  })
})

async function trace(policy?: ExecutionPolicy) {
  const { runtime, clock, seen, say } = setup(policy)
  runtime.handle(k("chain"), () => {
    seen.push("chain")
    runtime.submit(say("from chain"), schedule.after(3, "time"))
  })
  runtime.submit(say("a", { lane: "x" }))
  runtime.submit({ work: work(k("chain"), undefined), lane: "y" })
  runtime.submit(say("b", { lane: "x" }), schedule.after(3, "time"))
  runtime.submit(say("c", { lane: "y" }), schedule.after(1, "time"))
  const cancelled = runtime.submit(say("never"), schedule.after(2, "time"))

  await runtime.drain()
  cancelled.cancel()
  for (let i = 0; i < 4; i++) {
    clock.tick(1)
    await runtime.drain()
  }
  return seen
}

describe("determinism", () => {
  it("runs the same inputs in the same order every time", async () => {
    const first = await trace()

    expect(first).toEqual(["a", "chain", "c", "b", "from chain"])
    expect(await trace()).toEqual(first)
  })

  it("never reads wall time or randomness", async () => {
    const now = vi.spyOn(Date, "now")
    const perf = vi.spyOn(performance, "now")
    const random = vi.spyOn(Math, "random")

    await trace()

    expect(now).not.toHaveBeenCalled()
    expect(perf).not.toHaveBeenCalled()
    expect(random).not.toHaveBeenCalled()
  })
})

function firstOf(lane: ReadyLane): ReadyTask {
  return [...lane.items()][0] as ReadyTask
}

/** Takes one task from each lane in turn, in lane id order. */
function roundRobin(): ExecutionPolicy {
  let last: string | undefined
  return {
    next(lanes) {
      const sorted = [...lanes].sort((a, b) => (a.id < b.id ? -1 : 1))
      const lane = sorted.find(candidate => last === undefined || candidate.id > last) ?? sorted[0]
      if (!lane) {
        return undefined
      }
      last = lane.id
      return firstOf(lane).task.id
    },
  }
}

describe("execution policy", () => {
  it("decides the order of ready work: the same tasks run differently under another policy", async () => {
    const submitAll = (runtime: Runtime) => {
      runtime.submit({ work: work(k("say"), "a1"), lane: "a" })
      runtime.submit({ work: work(k("say"), "a2"), lane: "a" })
      runtime.submit({ work: work(k("say"), "a3"), lane: "a" })
      runtime.submit({ work: work(k("say"), "b1"), lane: "b" })
    }
    const fifo = setup()
    const fair = setup(roundRobin())
    submitAll(fifo.runtime)
    submitAll(fair.runtime)

    await fifo.runtime.drain()
    await fair.runtime.drain()

    expect(fifo.seen).toEqual(["a1", "a2", "a3", "b1"])
    expect(fair.seen).toEqual(["a1", "b1", "a2", "a3"])
  })

  it("can choose any ready task, not only the front of a lane", async () => {
    const urgentFirst: ExecutionPolicy = {
      next(lanes) {
        const all = [...lanes].flatMap(lane => [...lane.items()])
        return (all.find(ready => ready.task.work.input === "urgent") ?? all[0])?.task.id
      },
    }
    const { runtime, seen, say } = setup(urgentFirst)
    runtime.submit(say("normal 1"))
    runtime.submit(say("normal 2"))
    runtime.submit(say("urgent"))

    await runtime.drain()

    expect(seen).toEqual(["urgent", "normal 1", "normal 2"])
  })

  it("can decline to run ready work, which stays ready for a later step", async () => {
    let allowed = 2
    const budgeted: ExecutionPolicy = {
      next(lanes) {
        if (allowed <= 0) {
          return undefined
        }
        allowed--
        return firstOf([...lanes][0] as ReadyLane).task.id
      },
    }
    const { runtime, seen, say } = setup(budgeted)
    const handles = ["1", "2", "3", "4", "5"].map(n => runtime.submit(say(n)))

    expect(await runtime.drain()).toBe(2)
    expect(seen).toEqual(["1", "2"])
    expect(runtime.pending).toBe(3)
    expect(handles[2]?.state).toBe("ready")

    allowed = 10
    expect(await runtime.drain()).toBe(3)
    expect(seen).toEqual(["1", "2", "3", "4", "5"])
  })

  it("is not consulted when nothing is ready", async () => {
    const next = vi.fn()
    const { runtime, clock, say } = setup({ next })
    runtime.submit(say("later"), schedule.after(5, "time"))

    await runtime.drain()
    clock.tick(1)
    await runtime.drain()

    expect(next).not.toHaveBeenCalled()
  })

  it("must choose a task that is ready", async () => {
    const { runtime, say } = setup({ next: () => taskId("task-999") })
    runtime.submit(say("x"))

    await expect(runtime.step()).rejects.toThrow("task task-999, which is not ready")
    // The failure leaves the runtime usable rather than stuck mid-step.
    await expect(runtime.step()).rejects.toThrow("not ready")
  })

  it("is shown the facts the runtime recorded about each ready task", async () => {
    const views: {
      sequence: number
      batch: number
      clock: string | undefined
      dueAt: number | undefined
    }[][] = []
    const spy: ExecutionPolicy = {
      next(lanes) {
        views.push(
          [...lanes].flatMap(lane =>
            [...lane.items()].map(ready => ({
              sequence: ready.task.sequence,
              batch: ready.batch,
              clock: ready.via?.clock,
              dueAt: ready.via?.dueAt,
            })),
          ),
        )
        return oldestReady().next(lanes)
      },
    }
    const { runtime, clock, say } = setup(spy)
    const other = testClock()
    runtime.attachClock("other", other)
    runtime.submit(say("on time"), schedule.after(5, "time"))
    runtime.submit(say("on other"), schedule.after(7, "other"))
    runtime.submit(say("now"))
    clock.tick(5)
    other.tick(7)

    await runtime.step()

    const [onTime, onOther, now] = [...(views[0] ?? [])].sort((a, b) => a.sequence - b.sequence)
    expect(now).toMatchObject({ clock: undefined, dueAt: undefined })
    expect(onTime).toMatchObject({ clock: "time", dueAt: 5 })
    expect(onOther).toMatchObject({ clock: "other", dueAt: 7 })
    // Released by one observation, so the two clocks' tasks share a batch and are unordered by it.
    expect(onTime?.batch).toBe(onOther?.batch)
    expect(now?.batch).toBeLessThan(onTime?.batch ?? 0)
  })

  it("is deterministic for the same inputs, whichever policy is in use", async () => {
    for (const make of [() => oldestReady(), roundRobin]) {
      expect(await trace(make())).toEqual(await trace(make()))
    }
  })
})

describe("ordering between clocks", () => {
  async function bothDue(policy?: ExecutionPolicy) {
    // "b-clock" is attached first and its task submitted first.
    const runtime = new Runtime(policy ? { policy } : {})
    const seen: string[] = []
    runtime.handle(k("say"), task => {
      seen.push(String(task.work.input))
    })
    const b = testClock()
    const a = testClock()
    runtime.attachClock("b-clock", b)
    runtime.attachClock("a-clock", a)
    runtime.submit({ work: work(k("say"), "on b") }, schedule.after(5, "b-clock"))
    runtime.submit({ work: work(k("say"), "on a") }, schedule.after(5, "a-clock"))
    b.tick(5)
    a.tick(5)
    await runtime.drain()
    return seen
  }

  it("does not follow the order clocks were attached in", async () => {
    expect(await bothDue()).toEqual(["on a", "on b"])
  })

  it("follows the order the policy is told to establish", async () => {
    expect(await bothDue(oldestReady({ clockOrder: ["b-clock", "a-clock"] }))).toEqual([
      "on b",
      "on a",
    ])
    expect(await bothDue(oldestReady({ clockOrder: ["a-clock", "b-clock"] }))).toEqual([
      "on a",
      "on b",
    ])
  })
})

describe("stepping", () => {
  it("runs exactly one task per step, and reports when there is nothing to run", async () => {
    const { runtime, seen, say } = setup()
    runtime.submit(say("one"))
    runtime.submit(say("two"))

    expect(await runtime.step()).toBe(true)
    expect(seen).toEqual(["one"])
    expect(await runtime.step()).toBe(true)
    expect(await runtime.step()).toBe(false)
    expect(seen).toEqual(["one", "two"])
  })

  it("lets a caller bound work that keeps producing work", async () => {
    const { runtime } = setup()
    let runs = 0
    runtime.handle(k("spin"), () => {
      runs++
      runtime.submit({ work: work(k("spin"), undefined) })
    })
    runtime.submit({ work: work(k("spin"), undefined) })

    for (let i = 0; i < 5; i++) {
      await runtime.step()
    }

    expect(runs).toBe(5)
    expect(runtime.pending).toBe(1)
  })

  it("counts a task and everything it runs inline as one step", async () => {
    const { runtime, seen, say } = setup()
    runtime.handle(k("force"), async (_task, context) => {
      await context.run(say("inline"))
    })
    runtime.submit({ work: work(k("force"), undefined) })

    expect(await runtime.step()).toBe(true)
    expect(seen).toEqual(["inline"])
    expect(await runtime.step()).toBe(false)
  })
})

describe("inline execution", () => {
  it("is allowed unless the policy says otherwise", async () => {
    const { runtime, seen, say } = setup(oldestReady())
    runtime.handle(k("force"), async (_task, context) => {
      await context.run(say("inline"))
    })
    runtime.submit({ work: work(k("force"), undefined) })

    await runtime.drain()

    expect(seen).toEqual(["inline"])
  })

  it("can be forbidden by the policy", async () => {
    const forbid: ExecutionPolicy = { next: oldestReady().next, allowInline: () => false }
    const { runtime, seen, say } = setup(forbid)
    runtime.handle(k("force"), async (_task, context) => {
      await context.run(say("inline"))
    })
    const handle = runtime.submit({ work: work(k("force"), undefined) })

    await runtime.drain()

    const outcome = await handle.settled
    expect(outcome).toMatchObject({ state: "failed" })
    expect(String((outcome as { error: unknown }).error)).toContain("does not allow")
    expect(seen).toEqual([])
  })

  it("lets the policy limit how deep inline runs nest", async () => {
    const requests: { parent: string; depth: number }[] = []
    const shallow: ExecutionPolicy = {
      next: oldestReady().next,
      allowInline({ parent, depth }) {
        requests.push({ parent: parent.id, depth })
        return depth <= 1
      },
    }
    const { runtime, seen } = setup(shallow)
    runtime.handle(k("outer"), async (_task, context) => {
      seen.push("outer")
      await context.run({ work: work(k("middle"), undefined) })
    })
    runtime.handle(k("middle"), async (_task, context) => {
      seen.push("middle")
      seen.push(`inner: ${(await context.run({ work: work(k("inner"), undefined) })).state}`)
    })
    runtime.handle(k("inner"), () => {
      seen.push("inner")
    })
    runtime.submit({ work: work(k("outer"), undefined) })

    await runtime.drain()

    expect(seen).toEqual(["outer", "middle"])
    expect(requests.map(request => request.depth)).toEqual([1, 2])
  })
})

describe("clocks", () => {
  it("reads any clock whose readings are whole numbers, such as a wall clock", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    const { runtime, seen, say } = setup()
    runtime.attachClock("wall", new WallClock())
    runtime.submit(say("later"), schedule.after(500, "wall"))

    await runtime.drain()
    expect(seen).toEqual([])
    now.mockReturnValue(1_000_500)
    await runtime.drain()

    expect(seen).toEqual(["later"])
    expect(runtime.now("wall")).toBe(1_000_500)
  })

  it("refuses a clock that moves backwards, since work scheduled on it would be delayed", () => {
    const readings = [100n, 40n]
    const { runtime, say } = setup()
    const backwards: Clock<{ readonly value: bigint }> = {
      now: () => ({ value: readings.shift() ?? 40n }),
    }
    runtime.attachClock("odd", backwards)

    expect(runtime.now("odd")).toBe(100)
    expect(() => runtime.submit(say("x"), schedule.after(5, "odd"))).toThrow(
      'Clock "odd" moved backwards, from 100 to 40',
    )
  })

  it("refuses a reading it cannot represent exactly", () => {
    const { runtime } = setup()
    runtime.attachClock("huge", { now: () => ({ value: 2n ** 60n }) })

    expect(() => runtime.now("huge")).toThrow(RangeError)
  })
})

describe("waiting", () => {
  /** Suspends the first time it runs, and finishes when it runs again. */
  function waitsOnce(seen: string[]) {
    return (task: Task, context: TaskContext) => {
      if (context.continuation === undefined) {
        seen.push(`${task.work.input}:suspend`)
        return suspend({ resumeWith: `${task.work.input} again` })
      }
      seen.push(`${task.work.input}:resume`)
    }
  }

  it("takes a task that suspends out of running and into waiting", async () => {
    const { runtime, seen } = setup()
    runtime.handle(k("wait"), waitsOnce(seen))
    const handle = runtime.submit({ work: work(k("wait"), "a") })

    expect(await runtime.drain()).toBe(1)

    expect(handle.state).toBe("waiting")
    expect(seen).toEqual(["a:suspend"])
    expect(runtime.pending).toBe(1)
    expect(await Promise.race([handle.settled, Promise.resolve("still waiting")])).toBe(
      "still waiting",
    )
  })

  it("does not run a waiting task again until it is woken", async () => {
    const { runtime, seen } = setup()
    runtime.handle(k("wait"), waitsOnce(seen))
    runtime.submit({ work: work(k("wait"), "a") })
    await runtime.drain()

    expect(await runtime.drain()).toBe(0)
    expect(await runtime.step()).toBe(false)
    expect(seen).toEqual(["a:suspend"])
  })

  it("makes a woken task ready, and runs it again with the continuation it suspended with", async () => {
    const resumed: unknown[] = []
    const { runtime } = setup()
    runtime.handle(k("wait"), (_task, context) => {
      resumed.push(context.continuation)
      return context.continuation === undefined ? suspend({ line: 42 }) : undefined
    })
    const handle = runtime.submit({ work: work(k("wait"), undefined) })
    await runtime.drain()

    runtime.wake(handle.id)
    expect(handle.state).toBe("ready")
    await runtime.drain()

    expect(resumed).toEqual([undefined, { line: 42 }])
    expect(handle.state).toBe("completed")
    expect(await handle.settled).toEqual({ state: "completed" })
  })

  it("hands a continuation back once, and a task can suspend again", async () => {
    const seenContinuations: unknown[] = []
    const { runtime } = setup()
    runtime.handle(k("again"), (_task, context) => {
      seenContinuations.push(context.continuation)
      if (seenContinuations.length === 1) {
        return suspend("first")
      }
      if (seenContinuations.length === 2) {
        return suspend()
      }
    })
    const handle = runtime.submit({ work: work(k("again"), undefined) })

    await runtime.drain()
    runtime.wake(handle.id)
    await runtime.drain()
    expect(handle.state).toBe("waiting")
    runtime.wake(handle.id)
    await runtime.drain()

    expect(seenContinuations).toEqual([undefined, "first", undefined])
    expect(handle.state).toBe("completed")
  })

  it("runs woken tasks in the order they were woken, not the order they were created", async () => {
    const { runtime, seen } = setup()
    runtime.handle(k("wait"), waitsOnce(seen))
    const [a, b, c] = ["a", "b", "c"].map(payload =>
      runtime.submit({ work: work(k("wait"), payload) }),
    )
    await runtime.drain()
    seen.length = 0

    runtime.wake((b as { id: TaskId }).id)
    runtime.wake((a as { id: TaskId }).id)
    await runtime.drain()

    expect(seen).toEqual(["b:resume", "a:resume"])
    expect((c as { state: string }).state).toBe("waiting")
  })

  it("is not moved by a clock, since it is waiting for something other than time", async () => {
    const { runtime, clock, seen } = setup()
    runtime.handle(k("wait"), waitsOnce(seen))
    const handle = runtime.submit({ work: work(k("wait"), "a") }, schedule.after(5, "time"))
    clock.tick(5)
    await runtime.drain()

    clock.tick(1_000)
    await runtime.drain()

    expect(handle.state).toBe("waiting")
    expect(seen).toEqual(["a:suspend"])
  })

  it("is ready because it was woken, so it carries no due time from before", async () => {
    const views: (unknown | undefined)[][] = []
    const spy: ExecutionPolicy = {
      next(lanes) {
        views.push([...lanes].flatMap(lane => [...lane.items()].map(ready => ready.via)))
        return oldestReady().next(lanes)
      },
    }
    const { runtime, clock, seen } = setup(spy)
    runtime.handle(k("wait"), waitsOnce(seen))
    const handle = runtime.submit({ work: work(k("wait"), "a") }, schedule.after(5, "time"))
    clock.tick(5)
    await runtime.drain()
    const firstRun = views.at(-1)
    views.length = 0

    runtime.wake(handle.id)
    await runtime.drain()

    expect(firstRun).toEqual([{ clock: "time", dueAt: 5 }])
    expect(views[0]).toEqual([undefined])
  })

  describe("wake", () => {
    it("refuses a task that is not waiting, and says what state it is in", async () => {
      const { runtime, say } = setup()
      runtime.handle(k("later"), () => reschedule(schedule.after(5, "time")))
      const scheduled = runtime.submit({ work: work(k("later"), undefined) })
      await runtime.drain()
      const ready = runtime.submit(say("ready"))
      const pending = runtime.submit(say("pending"), schedule.after(5, "time"))
      const errors: string[] = []
      runtime.handle(k("self"), task => {
        try {
          runtime.wake(task.id)
        } catch (error) {
          errors.push(String(error))
        }
      })

      expect(() => runtime.wake(ready.id)).toThrow("while it is ready")
      expect(() => runtime.wake(pending.id)).toThrow("while it is pending")
      expect(() => runtime.wake(scheduled.id)).toThrow("while it is scheduled")

      runtime.submit({ work: work(k("self"), undefined) })
      await runtime.drain()
      expect(errors.some(error => error.includes("while it is running"))).toBe(true)
    })

    it("refuses a task that is unknown or has finished", async () => {
      const { runtime, say } = setup()
      const done = runtime.submit(say("done"))
      await runtime.drain()

      expect(() => runtime.wake(done.id)).toThrow("unknown or has finished")
      expect(() => runtime.wake(taskId("task-999"))).toThrow("unknown or has finished")
    })
  })

  describe("cancellation", () => {
    it("cancels a waiting task, which then cannot be woken", async () => {
      const { runtime, seen } = setup()
      runtime.handle(k("wait"), waitsOnce(seen))
      const handle = runtime.submit({ work: work(k("wait"), "a") })
      await runtime.drain()

      expect(handle.cancel("no longer needed")).toBe(true)

      expect(handle.state).toBe("cancelled")
      expect(await handle.settled).toEqual({ state: "cancelled", reason: "no longer needed" })
      expect(runtime.pending).toBe(0)
      expect(() => runtime.wake(handle.id)).toThrow("unknown or has finished")
    })

    it("cancels waiting tasks by lane and by tag", async () => {
      const { runtime, seen } = setup()
      runtime.handle(k("wait"), waitsOnce(seen))
      runtime.submit({ work: work(k("wait"), "a"), lane: "session-1" })
      runtime.submit({ work: work(k("wait"), "b"), lane: "session-1", tags: ["sem"] })
      runtime.submit({ work: work(k("wait"), "c"), lane: "session-2", tags: ["sem"] })
      runtime.submit({ work: work(k("wait"), "d"), lane: "session-3" })
      await runtime.drain()

      expect(runtime.cancelLane("session-1")).toBe(2)
      expect(runtime.cancelTag("sem")).toBe(1)
      expect(runtime.pending).toBe(1)
    })

    it("ends as cancelled, not waiting, when cancelled while it is running and asks to suspend", async () => {
      const { runtime } = setup()
      let release: () => void = () => {}
      runtime.handle(k("long"), async () => {
        await new Promise<void>(resolve => {
          release = resolve
        })
        return suspend()
      })
      const handle = runtime.submit({ work: work(k("long"), undefined) })
      const drained = runtime.drain()
      await new Promise(resolve => setImmediate(resolve))

      handle.cancel("stop")
      release()
      await drained

      expect(handle.state).toBe("cancelled")
      expect(await handle.settled).toEqual({ state: "cancelled", reason: "stop" })
      expect(runtime.pending).toBe(0)
    })
  })

  it("does not let a task run inline suspend, since there is nothing for it to wait inside of", async () => {
    const { runtime } = setup()
    const outcomes: unknown[] = []
    runtime.handle(k("wait"), () => suspend())
    runtime.handle(k("force"), async (_task, context) => {
      outcomes.push(await context.run({ work: work(k("wait"), undefined) }))
    })
    runtime.submit({ work: work(k("force"), undefined) })

    await runtime.drain()

    expect(outcomes).toMatchObject([{ state: "failed" }])
    expect(String((outcomes[0] as { error: unknown }).error)).toContain("cannot suspend")
    expect(runtime.pending).toBe(0)
  })
})

describe("rescheduling", () => {
  it("takes a task that reschedules out of running and into scheduled", async () => {
    const { runtime, seen } = setup()
    runtime.handle(k("later"), () => reschedule(schedule.after(10, "time")))
    const handle = runtime.submit({ work: work(k("later"), undefined) })

    await runtime.drain()

    expect(handle.state).toBe("scheduled")
    expect(seen).toEqual([])
    expect(runtime.pending).toBe(1)
  })

  it("runs a rescheduled task again once its clock reaches the new due time", async () => {
    const { runtime, clock } = setup()
    let ran = 0
    runtime.handle(k("later"), () => {
      ran++
      if (ran === 1) {
        return reschedule(schedule.after(10, "time"))
      }
    })
    const handle = runtime.submit({ work: work(k("later"), undefined) })
    await runtime.drain()

    clock.tick(9)
    await runtime.drain()
    expect(handle.state).toBe("scheduled")

    clock.tick(1)
    await runtime.drain()

    expect(ran).toBe(2)
    expect(handle.state).toBe("completed")
  })

  it("hands a continuation back once, the same way suspend does", async () => {
    const seenContinuations: unknown[] = []
    const { runtime, clock } = setup()
    runtime.handle(k("again"), (_task, context) => {
      seenContinuations.push(context.continuation)
      if (seenContinuations.length === 1) {
        return reschedule(schedule.after(5, "time"), "first")
      }
    })
    runtime.submit({ work: work(k("again"), undefined) })
    await runtime.drain()

    clock.tick(5)
    await runtime.drain()

    expect(seenContinuations).toEqual([undefined, "first"])
  })

  it("makes a task rescheduled for now, or an already-due time, ready immediately", async () => {
    const { runtime } = setup()
    let ran = 0
    runtime.handle(k("now"), () => {
      ran++
      if (ran === 1) {
        return reschedule(schedule.now)
      }
    })
    const handle = runtime.submit({ work: work(k("now"), undefined) })

    await runtime.drain()

    expect(ran).toBe(2)
    expect(handle.state).toBe("completed")
  })

  it("is recurring work: a handler that keeps rescheduling itself runs on every due time", async () => {
    const { runtime, clock } = setup()
    let ran = 0
    runtime.handle(k("tick"), () => {
      ran++
      if (ran < 3) {
        return reschedule(schedule.after(10, "time"))
      }
    })
    const handle = runtime.submit({ work: work(k("tick"), undefined) })

    for (let i = 0; i < 3; i++) {
      await runtime.drain()
      clock.tick(10)
    }
    await runtime.drain()

    expect(ran).toBe(3)
    expect(handle.state).toBe("completed")
  })

  it("preserves the task's id and sequence across a reschedule", async () => {
    const { runtime, clock } = setup()
    const seenIds: unknown[] = []
    const seenSequences: unknown[] = []
    runtime.handle(k("later"), task => {
      seenIds.push(task.id)
      seenSequences.push(task.sequence)
      if (seenIds.length === 1) {
        return reschedule(schedule.after(10, "time"))
      }
    })
    const handle = runtime.submit({ work: work(k("later"), undefined) })
    await runtime.drain()
    clock.tick(10)
    await runtime.drain()

    expect(seenIds[0]).toBe(seenIds[1])
    expect(seenIds[0]).toBe(handle.id)
    expect(seenSequences[0]).toBe(seenSequences[1])
  })

  it("is shown the same via facts a pending task would be, while scheduled", async () => {
    const views: { clock: string | undefined; dueAt: number | undefined }[][] = []
    const spy: ExecutionPolicy = {
      next(lanes) {
        views.push(
          [...lanes].flatMap(lane =>
            [...lane.items()].map(ready => ({ clock: ready.via?.clock, dueAt: ready.via?.dueAt })),
          ),
        )
        return oldestReady().next(lanes)
      },
    }
    const { runtime, clock } = setup(spy)
    let ran = 0
    runtime.handle(k("later"), () => {
      ran++
      if (ran === 1) {
        return reschedule(schedule.after(10, "time"))
      }
    })
    runtime.submit({ work: work(k("later"), undefined) })
    await runtime.drain()
    views.length = 0

    clock.tick(10)
    await runtime.drain()

    expect(views[0]).toEqual([{ clock: "time", dueAt: 10 }])
  })

  it("cancels a scheduled task so it never runs again", async () => {
    const { runtime, clock } = setup()
    let ran = 0
    runtime.handle(k("later"), () => {
      ran++
      return reschedule(schedule.after(10, "time"))
    })
    const handle = runtime.submit({ work: work(k("later"), undefined) })
    await runtime.drain()
    expect(handle.state).toBe("scheduled")

    handle.cancel()
    clock.tick(10)
    await runtime.drain()

    expect(ran).toBe(1)
    expect(handle.state).toBe("cancelled")
    expect(runtime.pending).toBe(0)
  })

  it("does not let a task run inline reschedule, since there is nothing for it to wait inside of", async () => {
    const { runtime } = setup()
    const outcomes: unknown[] = []
    runtime.handle(k("later"), () => reschedule(schedule.after(10, "time")))
    runtime.handle(k("force"), async (_task, context) => {
      outcomes.push(await context.run({ work: work(k("later"), undefined) }))
    })
    runtime.submit({ work: work(k("force"), undefined) })

    await runtime.drain()

    expect(outcomes).toMatchObject([{ state: "failed" }])
    expect(String((outcomes[0] as { error: unknown }).error)).toContain("cannot reschedule")
    expect(runtime.pending).toBe(0)
  })

  it("cancels a scheduled task by lane or tag, the same as a pending one", async () => {
    const { runtime } = setup()
    runtime.handle(k("later"), () => reschedule(schedule.after(10, "time")))
    runtime.submit({ work: work(k("later"), undefined), lane: "session-1" })
    runtime.submit({ work: work(k("later"), undefined), tags: ["combat"] })
    await runtime.drain()

    expect(runtime.cancelLane("session-1")).toBe(1)
    expect(runtime.cancelTag("combat")).toBe(1)
    expect(runtime.pending).toBe(0)
  })

  it("does not cancel a task that already finished after rescheduling once", async () => {
    const { runtime, clock } = setup()
    let ran = 0
    runtime.handle(k("later"), () => {
      ran++
      if (ran === 1) {
        return reschedule(schedule.after(5, "time"))
      }
    })
    const handle = runtime.submit({ work: work(k("later"), undefined) })
    await runtime.drain()
    clock.tick(5)
    await runtime.drain()
    expect(handle.state).toBe("completed")

    expect(handle.cancel()).toBe(false)
    expect(handle.state).toBe("completed")
  })

  it("moves a repeatedly rescheduled task between different clocks' timelines", async () => {
    const { runtime, clock } = setup()
    const other = testClock()
    runtime.attachClock("other", other)
    const seenClocks: unknown[] = []
    runtime.handle(k("later"), () => {
      seenClocks.push(runtime.pending)
      if (seenClocks.length === 1) {
        return reschedule(schedule.after(5, "time"))
      }
      if (seenClocks.length === 2) {
        return reschedule(schedule.after(5, "other"))
      }
    })
    const handle = runtime.submit({ work: work(k("later"), undefined) })
    await runtime.drain()

    clock.tick(5)
    await runtime.drain()
    expect(handle.state).toBe("scheduled")

    other.tick(5)
    await runtime.drain()

    expect(seenClocks).toHaveLength(3)
    expect(handle.state).toBe("completed")
  })

  it("shares a batch with a pending task released by the same observation", async () => {
    const views: { batch: number }[][] = []
    const spy: ExecutionPolicy = {
      next(lanes) {
        views.push(
          [...lanes].flatMap(lane => [...lane.items()].map(ready => ({ batch: ready.batch }))),
        )
        return oldestReady().next(lanes)
      },
    }
    const { runtime, clock, say } = setup(spy)
    let ran = 0
    runtime.handle(k("later"), () => {
      ran++
      if (ran === 1) {
        return reschedule(schedule.after(5, "time"))
      }
    })
    runtime.submit({ work: work(k("later"), undefined) })
    await runtime.drain()
    runtime.submit(say("also due"), schedule.after(5, "time"))
    views.length = 0

    clock.tick(5)
    await runtime.drain()

    const [rescheduled, pending] = views[0] ?? []
    expect(rescheduled?.batch).toBe(pending?.batch)
  })

  it("rejects an invalid reschedule the same way an invalid admission schedule is rejected", async () => {
    const { runtime } = setup()
    runtime.handle(k("later"), () => reschedule(schedule.after(-1, "time")))
    const handle = runtime.submit({ work: work(k("later"), undefined) })

    await runtime.drain()

    expect(handle.state).toBe("failed")
    const outcome = await handle.settled
    expect(outcome).toMatchObject({ state: "failed" })
    expect(String((outcome as { error: unknown }).error)).toContain("Invalid schedule time")
    expect(runtime.pending).toBe(0)
  })

  it("rejects a reschedule that names an unattached clock, and does not leave the runtime stuck", async () => {
    const { runtime } = setup()
    runtime.handle(k("later"), () => reschedule(schedule.after(5, "nonexistent")))
    const handle = runtime.submit({ work: work(k("later"), undefined) })

    await expect(runtime.drain()).resolves.toBe(1)

    expect(handle.state).toBe("failed")
    const outcome = await handle.settled
    expect(outcome).toMatchObject({ state: "failed" })
    expect(String((outcome as { error: unknown }).error)).toContain('Unknown clock "nonexistent"')
    expect(runtime.pending).toBe(0)
  })

  it("hands a continuation through a mixed chain of suspending and rescheduling", async () => {
    const seenContinuations: unknown[] = []
    const { runtime, clock } = setup()
    runtime.handle(k("mixed"), (_task, context) => {
      seenContinuations.push(context.continuation)
      switch (seenContinuations.length) {
        case 1:
          return suspend("after waiting")
        case 2:
          return reschedule(schedule.after(5, "time"), "after scheduling")
        default:
          return undefined
      }
    })
    const handle = runtime.submit({ work: work(k("mixed"), undefined) })
    await runtime.drain()
    expect(handle.state).toBe("waiting")

    runtime.wake(handle.id)
    await runtime.drain()
    expect(handle.state).toBe("scheduled")

    clock.tick(5)
    await runtime.drain()

    expect(seenContinuations).toEqual([undefined, "after waiting", "after scheduling"])
    expect(handle.state).toBe("completed")
  })
})
