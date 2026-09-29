import { describe, expect, it } from "vitest"

import { ExceptionalErrors } from "./exceptional-errors.ts"

describe("ExceptionalErrors", () => {
  it("creates an error from a message", () => {
    const errors = ExceptionalErrors.create()

    const error = errors.create("something failed")

    expect(error.message).toBe("something failed")
  })

  it("creates an error with a cause, propagating its message", () => {
    const errors = ExceptionalErrors.create()
    const cause = new Error("root cause")

    const error = errors.create({ cause })

    expect(error.originalMessage).toBe("root cause")
    expect(error.cause).toBe(cause)
  })

  it("propagates the message and cause when given an Error", () => {
    const errors = ExceptionalErrors.create()
    const cause = new TypeError("name cannot be empty")

    const error = errors.create(cause)

    expect(error.originalMessage).toBe("name cannot be empty")
    expect(error.cause).toBe(cause)
  })

  it("maps metadata to info", () => {
    const errors = ExceptionalErrors.create()

    const error = errors.create({
      metadata: {
        operation: "save",
      },
    })

    expect(error.info).toEqual({
      operation: "save",
    })
  })

  it("preserves typed metadata", () => {
    const errors = ExceptionalErrors.create()

    const error = errors.create({
      metadata: {
        operation: "save",
        entityId: "player-1",
      },
    })

    expect(error.info).toEqual({
      operation: "save",
      entityId: "player-1",
    })
  })
})
