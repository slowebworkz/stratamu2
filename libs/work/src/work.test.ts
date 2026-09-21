import { describe, expect, expectTypeOf, it } from "vitest"

import type { Work } from "./work.ts"
import { work } from "./work.ts"

type MushCommand = { line: string }
type MooProgram = { verb: string }
type AdapterWork = Work<"mush.command", MushCommand> | Work<"moo.program", MooProgram>

describe("work", () => {
  it("is an operation kind and the input that operation needs", () => {
    const w = work("mush.command", { line: "look" })

    expect(w).toEqual({ kind: "mush.command", input: { line: "look" } })
    expectTypeOf(w).toEqualTypeOf<Work<"mush.command", { line: string }>>()
  })

  it("is frozen, but only shallowly", () => {
    const w = work("mush.command", { line: "look" })

    expect(Object.isFrozen(w)).toBe(true)
    expect(Object.isFrozen(w.input)).toBe(false)
  })

  it("checks its kind at run time", () => {
    expect(() => work("Mush.Command", {})).toThrow(TypeError)
    expect(() => work("mush..command", {})).toThrow("Invalid work kind")
  })

  it("serialises as plain data and comes back through the constructor", () => {
    const stored = JSON.stringify(work("moo.program", { verb: "look" }))
    const parsed = JSON.parse(stored) as { kind: string; input: MooProgram }

    expect(stored).toBe('{"kind":"moo.program","input":{"verb":"look"}}')
    expect(work(parsed.kind as "moo.program", parsed.input)).toEqual(parsed)
  })

  it("is assignable to the general Work, whatever its kind", () => {
    const general: Work = work("mush.command", { line: "look" })

    expect(general.kind).toBe("mush.command")
  })
})

describe("a union of Work values", () => {
  function describeWork(w: AdapterWork): string {
    switch (w.kind) {
      case "mush.command":
        expectTypeOf(w.input).toEqualTypeOf<MushCommand>()
        return w.input.line
      case "moo.program":
        expectTypeOf(w.input).toEqualTypeOf<MooProgram>()
        return w.input.verb
    }
  }

  it("narrows on kind, so each branch sees its own input", () => {
    expect(describeWork(work("mush.command", { line: "look" }))).toBe("look")
    expect(describeWork(work("moo.program", { verb: "examine" }))).toBe("examine")
  })

  it("narrows in a conditional too", () => {
    const w = work("mush.command", { line: "look" }) as AdapterWork

    expect(w.kind === "mush.command" ? w.input.line : w.input.verb).toBe("look")
  })
})

// Checked by `pnpm typecheck`: if one of these lines stops being an error, its directive fails.
describe("Work rejects mix-ups at compile time", () => {
  it("does not accept a kind without a namespace", () => {
    // @ts-expect-error "command" is not a dotted name
    expect(() => work("command", {})).toThrow(TypeError)
  })

  it("does not accept a Work of one kind as another, or the wrong input", () => {
    // @ts-expect-error a mush command is not a moo program
    const wrongKind: Work<"moo.program", MooProgram> = work("mush.command", { verb: "x" })
    // @ts-expect-error the input type is part of the Work type
    const wrongInput: Work<"mush.command", MushCommand> = work("mush.command", { verb: "x" })

    expect([wrongKind, wrongInput]).toHaveLength(2)
  })
})
