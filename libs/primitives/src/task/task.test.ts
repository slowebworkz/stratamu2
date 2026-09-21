import { describe, expect, expectTypeOf, it } from "vitest"

import type { TaskId } from "./task-id.ts"
import { isTaskId, taskId } from "./task-id.ts"
import type { TaskPriority } from "./task-priority.ts"
import { isTaskPriority, taskPriority } from "./task-priority.ts"
import type { TaskSequence } from "./task-sequence.ts"
import { isTaskSequence, taskSequence } from "./task-sequence.ts"

describe("taskId", () => {
  it("brands a non-empty string", () => {
    expect(taskId("task-1")).toBe("task-1")
  })

  it.each(["", " ", "  \n"])("rejects %j, which has nothing in it", value => {
    expect(() => taskId(value)).toThrow(TypeError)
  })
})

describe("isTaskId", () => {
  it("accepts a string with something in it", () => {
    expect(isTaskId("task-1")).toBe(true)
  })

  it.each(["", "  ", 1, null, undefined, {}, ["task-1"]])("rejects %j", value => {
    expect(isTaskId(value)).toBe(false)
  })

  it("narrows unknown data, such as a value read from storage, to a TaskId", () => {
    const stored: unknown = JSON.parse('{"id":"task-7"}').id

    if (!isTaskId(stored)) {
      throw new Error("expected a task id")
    }

    expectTypeOf(stored).toEqualTypeOf<TaskId>()
    expect(stored).toBe("task-7")
  })
})

describe("taskPriority", () => {
  it("brands any finite number, including negatives and fractions", () => {
    expect(taskPriority(0)).toBe(0)
    expect(taskPriority(-5)).toBe(-5)
    expect(taskPriority(2.5)).toBe(2.5)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects %s", value => {
    expect(() => taskPriority(value)).toThrow(RangeError)
  })
})

describe("isTaskPriority", () => {
  it.each([0, -5, 2.5, Number.MAX_VALUE])("accepts %s", value => {
    expect(isTaskPriority(value)).toBe(true)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects %s", value => {
    expect(isTaskPriority(value)).toBe(false)
  })

  it.each(["5", null, undefined, {}, [1]])("rejects %j, which is not a number", value => {
    expect(isTaskPriority(value)).toBe(false)
  })
})

describe("taskSequence", () => {
  it("brands a non-negative safe integer", () => {
    expect(taskSequence(0)).toBe(0)
    expect(taskSequence(18_427)).toBe(18_427)
    expect(taskSequence(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects %s",
    value => {
      expect(() => taskSequence(value)).toThrow(RangeError)
    },
  )

  it("orders with ordinary comparison", () => {
    expect(taskSequence(2) - taskSequence(1)).toBe(1)
    expect(taskSequence(1) < taskSequence(2)).toBe(true)
  })
})

describe("isTaskSequence", () => {
  it.each([0, 1, 18_427, Number.MAX_SAFE_INTEGER])("accepts %s", value => {
    expect(isTaskSequence(value)).toBe(true)
  })

  it.each([-1, 1.5, 2 ** 53, 2 ** 60, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %s",
    value => {
      expect(isTaskSequence(value)).toBe(false)
    },
  )

  it.each(["1", null, undefined, {}, [1]])("rejects %j, which is not a number", value => {
    expect(isTaskSequence(value)).toBe(false)
  })

  it("narrows unknown data, such as a value read from storage, to a TaskSequence", () => {
    const stored: unknown = JSON.parse('{"sequence":3}').sequence

    if (!isTaskSequence(stored)) {
      throw new Error("expected a task sequence")
    }

    expectTypeOf(stored).toEqualTypeOf<TaskSequence>()
    expect(stored).toBe(3)
  })
})

describe("persistence", () => {
  it("serialises as plain JSON values, with no special handling", () => {
    const stored = JSON.stringify({
      id: taskId("task-7"),
      priority: taskPriority(5),
      sequence: taskSequence(18_427),
    })

    expect(stored).toBe('{"id":"task-7","priority":5,"sequence":18427}')
  })

  it("is restored by passing the stored values back through the constructors", () => {
    const stored = JSON.parse('{"id":"task-7","sequence":3}') as {
      id: string
      sequence: number
    }

    expect(taskId(stored.id)).toBe("task-7")
    expect(taskSequence(stored.sequence)).toBe(3)
  })
})

// Checked by `pnpm typecheck`: if one of these lines stops being an error, its directive fails.
describe("task values are not interchangeable", () => {
  it("cannot be built from, or mistaken for, one another", () => {
    // @ts-expect-error a plain string is not a task id
    const fromString: TaskId = "task-1"
    // @ts-expect-error a plain number is not a sequence
    const fromNumber: TaskSequence = 1
    // @ts-expect-error a priority is not a sequence
    const priorityAsSequence: TaskSequence = taskPriority(1)
    // @ts-expect-error a sequence is not a priority
    const sequenceAsPriority: TaskPriority = taskSequence(1)

    expect([fromString, fromNumber, priorityAsSequence, sequenceAsPriority]).toHaveLength(4)
  })
})
