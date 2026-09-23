import { describe, expect, expectTypeOf, it } from "vitest"

import type { PrincipalId } from "./principal-id.ts"
import { isPrincipalId, principalId } from "./principal-id.ts"

describe("principalId", () => {
  it("brands a non-empty string", () => {
    expect(principalId("alice")).toBe("alice")
  })

  it.each(["", " ", "  \n"])("rejects %j, which has nothing in it", value => {
    expect(() => principalId(value)).toThrow(TypeError)
  })
})

describe("isPrincipalId", () => {
  it("accepts a string with something in it", () => {
    expect(isPrincipalId("alice")).toBe(true)
  })

  it.each(["", "  ", 1, null, undefined, {}, ["alice"]])("rejects %j", value => {
    expect(isPrincipalId(value)).toBe(false)
  })

  it("narrows unknown data, such as a value read from storage, to a PrincipalId", () => {
    const stored: unknown = JSON.parse('{"id":"alice"}').id

    if (!isPrincipalId(stored)) {
      throw new Error("expected a principal id")
    }

    expectTypeOf(stored).toEqualTypeOf<PrincipalId>()
    expect(stored).toBe("alice")
  })
})
