import { describe, expect, expectTypeOf, it } from "vitest"

import type { SessionId } from "./session-id.ts"
import { isSessionId, sessionId } from "./session-id.ts"

describe("sessionId", () => {
  it("brands a non-empty string", () => {
    expect(sessionId("session-1")).toBe("session-1")
  })

  it.each(["", " ", "  \n"])("rejects %j, which has nothing in it", value => {
    expect(() => sessionId(value)).toThrow(TypeError)
  })
})

describe("isSessionId", () => {
  it("accepts a string with something in it", () => {
    expect(isSessionId("session-1")).toBe(true)
  })

  it.each(["", "  ", 1, null, undefined, {}, ["session-1"]])("rejects %j", value => {
    expect(isSessionId(value)).toBe(false)
  })

  it("narrows unknown data, such as a value read from storage, to a SessionId", () => {
    const stored: unknown = JSON.parse('{"id":"session-7"}').id

    if (!isSessionId(stored)) {
      throw new Error("expected a session id")
    }

    expectTypeOf(stored).toEqualTypeOf<SessionId>()
    expect(stored).toBe("session-7")
  })
})
