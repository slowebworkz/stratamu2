import { entityId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("LOOK", () => {
  it("describes the room alone", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "room", name: "Here", description: "A small starting room.", occupants: [] }])
  })

  it("describes the room and who else is there", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-2", "bob")

    for (const item of adapter.parse({ session, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "room", name: "There", description: "A room further along.", occupants: [entityId("goblin")] }])
  })

  it("has no output for a session controlling nothing", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-3")

    for (const item of adapter.parse({ session, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-controlling" }])
  })
})

describe("EXITS", () => {
  it("lists the room's obvious exits", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "exits" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "exits", directions: ["north"] }])
  })

  it("reports no obvious exits from a room with none", async () => {
    const { runtime, adapter, here } = abermudFixture()
    adapter.rooms.set(here, {
      id: here,
      number: 1,
      name: "Here",
      description: "A small starting room.",
      exits: new Map(),
    })
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "exits" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "exits", directions: [] }])
  })
})
