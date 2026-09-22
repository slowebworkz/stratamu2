import { describe, expect, expectTypeOf, it } from "vitest"

import { entityType, isEntityType } from "./entity-type.ts"

const valid = ["mush.object", "moo.room", "diku.mobile", "a.b.c", "x-y.z_1"]
const invalid = [
  "",
  "object",
  "Mush.object",
  "mush.",
  ".object",
  "mush..object",
  "mush object",
  "1a.b",
]

describe("isEntityType", () => {
  it.each(valid)("accepts %s", value => {
    expect(isEntityType(value)).toBe(true)
  })

  it.each(invalid)('rejects "%s"', value => {
    expect(isEntityType(value)).toBe(false)
  })

  it.each([1, null, undefined, {}, ["mush.object"]])("rejects %j, which is not a string", value => {
    expect(isEntityType(value)).toBe(false)
  })

  it("gives the same answer every time it is asked", () => {
    // A regex with the `g` or `y` flag would alternate here.
    expect([1, 2, 3, 4].map(() => isEntityType("mush.object"))).toEqual([true, true, true, true])
  })

  it("narrows unknown data, such as a type read from storage, to an EntityType", () => {
    const stored: unknown = JSON.parse('{"type":"mush.object"}').type

    if (!isEntityType(stored)) {
      throw new Error("expected an entity type")
    }

    expectTypeOf(stored).toEqualTypeOf<`${string}.${string}`>()
    expect(stored).toBe("mush.object")
  })
})

describe("entityType", () => {
  it("returns the type it was given, with its literal type intact", () => {
    const type = entityType("mush.object")

    expect(type).toBe("mush.object")
    expectTypeOf(type).toEqualTypeOf<"mush.object">()
  })

  it("rejects a type that is not namespaced, at compile time and at run time", () => {
    // @ts-expect-error a type needs a namespace: "object" is not a dotted name
    expect(() => entityType("object")).toThrow(TypeError)
  })

  it("rejects what the type cannot check, at run time", () => {
    // The type only requires a dot, so these compile. The pattern is what rejects them.
    expect(() => entityType("Mush.Object")).toThrow(TypeError)
    expect(() => entityType("mush..object")).toThrow("Invalid entity type: mush..object")
  })

  it("does not accept a plain string until it has been through the guard", () => {
    const fromStorage = "mush.object" as string

    // @ts-expect-error a string variable is not known to be an entity type
    entityType(fromStorage)
    if (isEntityType(fromStorage)) {
      expect(entityType(fromStorage)).toBe("mush.object")
    }
  })
})
