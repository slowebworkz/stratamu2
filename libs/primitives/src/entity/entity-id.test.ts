import { describe, expect, expectTypeOf, it } from "vitest"

import type { EntityId } from "./entity-id.ts"
import { entityId, isEntityId } from "./entity-id.ts"

describe("entityId", () => {
  it("brands a non-empty string", () => {
    expect(entityId("entity-1")).toBe("entity-1")
  })

  it.each(["", " ", "  \n"])("rejects %j, which has nothing in it", value => {
    expect(() => entityId(value)).toThrow(TypeError)
  })
})

describe("isEntityId", () => {
  it("accepts a string with something in it", () => {
    expect(isEntityId("entity-1")).toBe(true)
  })

  it.each(["", "  ", 1, null, undefined, {}, ["entity-1"]])("rejects %j", value => {
    expect(isEntityId(value)).toBe(false)
  })

  it("narrows unknown data, such as a value read from storage, to an EntityId", () => {
    const stored: unknown = JSON.parse('{"id":"entity-7"}').id

    if (!isEntityId(stored)) {
      throw new Error("expected an entity id")
    }

    expectTypeOf(stored).toEqualTypeOf<EntityId>()
    expect(stored).toBe("entity-7")
  })
})
