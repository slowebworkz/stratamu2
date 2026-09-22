import { taskId, taskPriority, taskSequence } from "@stratamu/primitives"
import type { Work } from "@stratamu/work"
import { work } from "@stratamu/work"
import { describe, expect, expectTypeOf, it } from "vitest"

import type { Task } from "./task.ts"

type MushCommand = { line: string }

function admit<W extends Work>(w: W): Task<W> {
  return {
    id: taskId("task-1"),
    work: w,
    sequence: taskSequence(0),
    priority: taskPriority(0),
  }
}

describe("Task", () => {
  it("is a Work plus what the engine needed to admit it", () => {
    const task = admit(work("mush.command", { line: "look" }))

    expect(task).toEqual({
      id: "task-1",
      work: { kind: "mush.command", input: { line: "look" } },
      sequence: 0,
      priority: 0,
    })
  })

  it("narrows to the Work it wraps when given one", () => {
    const task: Task<Work<"mush.command", MushCommand>> = admit(
      work("mush.command", { line: "look" }),
    )

    expectTypeOf(task.work.input).toEqualTypeOf<MushCommand>()
  })

  // Checked by `pnpm typecheck`: if one of these stops being an error, its directive fails.
  it("requires priority, and does not accept a Work of another kind once narrowed", () => {
    const missingPriority: Task = {
      id: taskId("task-1"),
      work: work("mush.command", {}),
      sequence: taskSequence(0),
      // @ts-expect-error priority is required, not optional
      priority: undefined,
    }
    const wrongWork: Task<Work<"mush.command", MushCommand>> = {
      id: taskId("task-1"),
      // @ts-expect-error a moo.program Work is not a Work<"mush.command", MushCommand>
      work: work("moo.program", { verb: "x" }),
      sequence: taskSequence(0),
      priority: taskPriority(0),
    }

    expect([missingPriority, wrongWork]).toHaveLength(2)
  })

  it("does not yet carry lane, tags or a schedule", () => {
    const task = admit(work("mush.command", { line: "look" }))

    expect(task).not.toHaveProperty("lane")
    expect(task).not.toHaveProperty("tags")
    expect(task).not.toHaveProperty("state")
  })
})
