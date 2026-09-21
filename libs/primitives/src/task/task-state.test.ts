import { describe, expect, expectTypeOf, it } from "vitest"

import type { TaskState } from "./task-state.ts"
import { isTaskState, TASK_STATES } from "./task-state.ts"

describe("TASK_STATES", () => {
  it("lists exactly the seven states of the model, once each", () => {
    expect(TASK_STATES).toEqual([
      "pending",
      "ready",
      "running",
      "waiting",
      "completed",
      "failed",
      "cancelled",
    ])
    expect(new Set(TASK_STATES).size).toBe(7)
  })

  it("is what the TaskState type is made of", () => {
    expectTypeOf<TaskState>().toEqualTypeOf<(typeof TASK_STATES)[number]>()
    expectTypeOf<TaskState>().toEqualTypeOf<
      "pending" | "ready" | "running" | "waiting" | "completed" | "failed" | "cancelled"
    >()
  })
})

describe("isTaskState", () => {
  it.each(TASK_STATES)("accepts %s", state => {
    expect(isTaskState(state)).toBe(true)
  })

  it.each(["scheduled", "Pending", "", " ready", "done"])('rejects "%s"', value => {
    expect(isTaskState(value)).toBe(false)
  })

  it.each([1, null, undefined, {}, ["ready"]])("rejects %j, which is not a string", value => {
    expect(isTaskState(value)).toBe(false)
  })

  it("narrows unknown data, such as a state read from storage, to a TaskState", () => {
    const stored: unknown = JSON.parse('{"state":"waiting"}').state

    if (!isTaskState(stored)) {
      throw new Error("expected a task state")
    }

    expectTypeOf(stored).toEqualTypeOf<TaskState>()
    expect(stored).toBe("waiting")
  })

  it("does not accept the state name it replaced", () => {
    // @ts-expect-error "scheduled" was renamed to "pending"
    const old: TaskState = "scheduled"

    expect(isTaskState(old)).toBe(false)
  })
})
