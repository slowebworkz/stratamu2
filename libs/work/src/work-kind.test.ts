import { describe, expect, expectTypeOf, it } from "vitest"

import { isWorkKind, workKind } from "./work-kind.ts"

const valid = ["mush.command", "moo.program", "diku.combat", "a.b.c", "x-y.z_1"]
const invalid = [
  "",
  "command",
  "Mush.command",
  "mush.",
  ".command",
  "mush..command",
  "mush command",
  "1a.b",
]

describe("isWorkKind", () => {
  it.each(valid)("accepts %s", value => {
    expect(isWorkKind(value)).toBe(true)
  })

  it.each(invalid)('rejects "%s"', value => {
    expect(isWorkKind(value)).toBe(false)
  })

  it.each([1, null, undefined, {}, ["mush.command"]])(
    "rejects %j, which is not a string",
    value => {
      expect(isWorkKind(value)).toBe(false)
    },
  )

  it("gives the same answer every time it is asked", () => {
    // A regex with the `g` or `y` flag would alternate here.
    expect([1, 2, 3, 4].map(() => isWorkKind("mush.command"))).toEqual([true, true, true, true])
  })

  it("narrows unknown data, such as a kind read from storage, to a WorkKind", () => {
    const stored: unknown = JSON.parse('{"kind":"mush.command"}').kind

    if (!isWorkKind(stored)) {
      throw new Error("expected a work kind")
    }

    expectTypeOf(stored).toEqualTypeOf<`${string}.${string}`>()
    expect(stored).toBe("mush.command")
  })
})

describe("workKind", () => {
  it("returns the kind it was given, with its literal type intact", () => {
    const kind = workKind("mush.command")

    expect(kind).toBe("mush.command")
    expectTypeOf(kind).toEqualTypeOf<"mush.command">()
  })

  it("rejects a kind that is not namespaced, at compile time and at run time", () => {
    // @ts-expect-error a kind needs a namespace: "command" is not a dotted name
    expect(() => workKind("command")).toThrow(TypeError)
  })

  it("rejects what the type cannot check, at run time", () => {
    // The type only requires a dot, so these compile. The pattern is what rejects them.
    expect(() => workKind("Mush.Command")).toThrow(TypeError)
    expect(() => workKind("mush..command")).toThrow("Invalid work kind: mush..command")
  })

  it("does not accept a plain string until it has been through the guard", () => {
    const fromStorage = "mush.command" as string

    // @ts-expect-error a string variable is not known to be a work kind
    workKind(fromStorage)
    if (isWorkKind(fromStorage)) {
      expect(workKind(fromStorage)).toBe("mush.command")
    }
  })
})
