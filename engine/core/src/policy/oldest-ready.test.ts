import type { TaskId } from "@stratamu/primitives"
import { taskId, taskPriority, taskSequence } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { oldestReady } from "./oldest-ready.ts"
import type { ReadyLane, ReadyTask, ReadyVia } from "./types.ts"

const id = (n: number): TaskId => taskId(`task-${n}`)

function ready(n: number, batch: number, via?: ReadyVia): ReadyTask {
  return {
    task: {
      id: id(n),
      work: work(workKind("test.task"), undefined),
      sequence: taskSequence(n),
      priority: taskPriority(0),
    },
    batch,
    via,
  }
}

function lanes(...groups: ReadyTask[][]): ReadyLane[] {
  return groups.map((tasks, index) => ({
    id: `lane-${index}`,
    size: tasks.length,
    items: () => tasks,
  }))
}

describe("oldestReady", () => {
  it("chooses nothing when there is nothing ready", () => {
    expect(oldestReady().next([])).toBeUndefined()
  })

  it("chooses the task that became ready in the earliest batch", () => {
    const view = lanes([ready(1, 3)], [ready(2, 1)], [ready(3, 2)])

    expect(oldestReady().next(view)).toBe(id(2))
  })

  it("considers every task in a lane, not only the first", () => {
    expect(oldestReady().next(lanes([ready(1, 5), ready(2, 1)]))).toBe(id(2))
  })

  it("orders tasks from the same clock by due time, then by submission", () => {
    const at = (dueAt: number): ReadyVia => ({ clock: "time", dueAt })
    const view = lanes([ready(1, 1, at(9)), ready(2, 1, at(4)), ready(3, 1, at(4))])

    expect(oldestReady().next(view)).toBe(id(2))
  })

  it("does not depend on the order lanes or tasks are listed in", () => {
    const tasks = [
      ready(1, 2, { clock: "b", dueAt: 1 }),
      ready(2, 2, { clock: "a", dueAt: 99 }),
      ready(3, 1),
      ready(4, 2, { clock: "a", dueAt: 5 }),
    ]

    const chosen = new Set<TaskId | undefined>()
    for (const shuffled of [
      tasks,
      [...tasks].reverse(),
      [tasks[2], tasks[0], tasks[3], tasks[1]],
    ]) {
      chosen.add(oldestReady().next(lanes(shuffled as ReadyTask[])))
      chosen.add(oldestReady().next(lanes(...(shuffled as ReadyTask[]).map(task => [task]))))
    }

    expect([...chosen]).toEqual([id(3)])
  })

  describe("between clocks", () => {
    const fromB = ready(1, 1, { clock: "b", dueAt: 1_000 })
    const fromA = ready(2, 1, { clock: "a", dueAt: 5 })

    it("never compares times from different clocks", () => {
      // 5 < 1000, but those are different units, so the due times must not decide the order.
      const chosen = oldestReady({ clockOrder: ["b", "a"] }).next(lanes([fromA, fromB]))

      expect(chosen).toBe(id(1))
    })

    it("follows the configured clock order", () => {
      expect(oldestReady({ clockOrder: ["a", "b"] }).next(lanes([fromB, fromA]))).toBe(id(2))
      expect(oldestReady({ clockOrder: ["b", "a"] }).next(lanes([fromA, fromB]))).toBe(id(1))
    })

    it("puts unlisted clocks after listed ones, ordered by id", () => {
      const fromC = ready(3, 1, { clock: "c", dueAt: 1 })

      expect(oldestReady({ clockOrder: ["c"] }).next(lanes([fromA, fromB, fromC]))).toBe(id(3))
      expect(oldestReady().next(lanes([fromC, fromB, fromA]))).toBe(id(2))
    })

    it("still lets an earlier batch beat clock precedence", () => {
      const early = ready(9, 1, { clock: "b", dueAt: 1 })
      const late = ready(8, 2, { clock: "a", dueAt: 1 })

      expect(oldestReady({ clockOrder: ["a", "b"] }).next(lanes([late, early]))).toBe(id(9))
    })
  })
})
