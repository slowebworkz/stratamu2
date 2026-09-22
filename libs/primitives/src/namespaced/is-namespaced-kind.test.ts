import { describe, expect, expectTypeOf, it } from "vitest"

import { isNamespacedKind } from "./is-namespaced-kind.ts"

describe("isNamespacedKind", () => {
  it.each(["diku.command", "mush.wait", "moo.program", "a.b.c", "x-y.z_1", "population.reset"])(
    "accepts %s",
    value => {
      expect(isNamespacedKind(value)).toBe(true)
    },
  )

  it.each([
    "",
    "command",
    "Diku.command",
    "diku.Command",
    "diku.",
    ".command",
    "diku..command",
    "diku command",
    " diku.command",
    "diku.command ",
    "1a.b",
    "a.1b",
  ])('rejects "%s"', value => {
    expect(isNamespacedKind(value)).toBe(false)
  })

  it.each([1, null, undefined, {}, ["diku.command"], true])(
    "rejects %j, which is not a string",
    value => {
      expect(isNamespacedKind(value)).toBe(false)
    },
  )

  it("gives the same answer every time it is asked", () => {
    // A regex with the `g` or `y` flag would alternate here.
    expect([1, 2, 3, 4, 5, 6].map(() => isNamespacedKind("diku.command"))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ])
  })

  it("narrows unknown data, such as a kind read from storage, to a dotted name", () => {
    const stored: unknown = JSON.parse('{"kind":"mush.wait"}').kind

    if (!isNamespacedKind(stored)) {
      throw new Error("expected a namespaced kind")
    }

    expectTypeOf(stored).toEqualTypeOf<`${string}.${string}`>()
    expect(stored).toBe("mush.wait")
  })
})
