import { entityId } from "@stratamu/primitives"
import { describe, expect, expectTypeOf, it } from "vitest"

import type { Entity } from "./entity.ts"
import { entity } from "./entity.ts"

type AdapterEntity = Entity<"mush.object"> | Entity<"moo.room">

describe("entity", () => {
  it("is an identity and the type that identity is", () => {
    const e = entity(entityId("entity-1"), "mush.object")

    expect(e).toEqual({ id: "entity-1", type: "mush.object" })
    expectTypeOf(e).toEqualTypeOf<Entity<"mush.object">>()
  })

  it("is frozen", () => {
    const e = entity(entityId("entity-1"), "mush.object")

    expect(Object.isFrozen(e)).toBe(true)
  })

  it("checks its type at run time", () => {
    expect(() => entity(entityId("entity-1"), "Mush.Object" as "mush.object")).toThrow(TypeError)
    expect(() => entity(entityId("entity-1"), "mush..object" as "mush.object")).toThrow(
      "Invalid entity type",
    )
  })

  it("serialises as plain data and comes back through the constructor", () => {
    const stored = JSON.stringify(entity(entityId("entity-1"), "moo.room"))
    const parsed = JSON.parse(stored) as { id: string; type: string }

    expect(stored).toBe('{"id":"entity-1","type":"moo.room"}')
    expect(entity(entityId(parsed.id), parsed.type as "moo.room")).toEqual(parsed)
  })

  it("is assignable to the general Entity, whatever its type", () => {
    const general: Entity = entity(entityId("entity-1"), "mush.object")

    expect(general.type).toBe("mush.object")
  })
})

describe("a union of Entity values", () => {
  function describeEntity(e: AdapterEntity): string {
    switch (e.type) {
      case "mush.object":
        return `object ${e.id}`
      case "moo.room":
        return `room ${e.id}`
    }
  }

  it("narrows on type, so each branch sees its own kind of entity", () => {
    expect(describeEntity(entity(entityId("entity-1"), "mush.object"))).toBe("object entity-1")
    expect(describeEntity(entity(entityId("entity-2"), "moo.room"))).toBe("room entity-2")
  })
})

// Checked by `pnpm typecheck`: if one of these lines stops being an error, its directive fails.
describe("Entity rejects mix-ups at compile time", () => {
  it("does not accept a type without a namespace", () => {
    // @ts-expect-error "object" is not a dotted name
    expect(() => entity(entityId("entity-1"), "object")).toThrow(TypeError)
  })

  it("does not accept an Entity of one type as another", () => {
    // @ts-expect-error a mush object is not a moo room
    const wrongType: Entity<"moo.room"> = entity(entityId("entity-1"), "mush.object")

    expect(wrongType.type).toBe("mush.object")
  })
})
