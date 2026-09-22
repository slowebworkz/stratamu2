import type { Work } from "@stratamu/work"
import { work } from "@stratamu/work"
import { describe, expect, expectTypeOf, it } from "vitest"

import type { Submission } from "./submission.ts"

type MushCommand = { line: string }

describe("Submission", () => {
  it("is a request to have a Work executed", () => {
    const submission: Submission = { work: work("mush.command", { line: "look" }) }

    expect(submission.work.kind).toBe("mush.command")
    expect(submission.work.input).toEqual({ line: "look" })
  })

  it("narrows to the Work it wraps when given one", () => {
    const submission: Submission<Work<"mush.command", MushCommand>> = {
      work: work("mush.command", { line: "look" }),
    }

    expectTypeOf(submission.work.input).toEqualTypeOf<MushCommand>()
  })

  // Checked by `pnpm typecheck`: if this stops being an error, the directive fails.
  it("does not accept a Work of another kind once narrowed", () => {
    const wrong: Submission<Work<"mush.command", MushCommand>> = {
      // @ts-expect-error a moo.program Work is not a Work<"mush.command", MushCommand>
      work: work("moo.program", { verb: "x" }),
    }

    expect(wrong).toBeDefined()
  })
})
