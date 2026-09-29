import { afterEach, describe, expect, it } from "vitest"

import { ExceptionalErrors } from "./exceptional-errors.ts"
import { createErrorCapability, setRootErrors } from "./root-errors.ts"

afterEach(() => {
  setRootErrors(ExceptionalErrors.create())
})

describe("root errors", () => {
  it("creates the default error capability lazily", () => {
    const errors = createErrorCapability()

    expect(errors).toBeInstanceOf(ExceptionalErrors)
  })

  it("reuses the root error capability", () => {
    const first = createErrorCapability()
    const second = createErrorCapability()

    expect(second).toBe(first)
  })

  it("uses a configured root error capability", () => {
    const errors = ExceptionalErrors.create()

    setRootErrors(errors)

    expect(createErrorCapability()).toBe(errors)
  })
})
