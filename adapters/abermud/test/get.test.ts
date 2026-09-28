import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("GET", () => {
  it("picks up a takeable object and moves it into the actor's inventory", async () => {
    const { runtime, world, adapter, here, alicePlayer, sword } = abermudFixture()
    world.locate(sword, here)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "get sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([
      { kind: "taken", perspective: "actor", actor: "alice", item: "sword" },
    ])
    expect(world.locationOf(sword)).toBe(alicePlayer)
    expect([...world.occupants(here)]).not.toContain(sword)
  })

  it("takes the same verb from TAKE", async () => {
    const { runtime, world, adapter, here, sword } = abermudFixture()
    world.locate(sword, here)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "take sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([
      { kind: "taken", perspective: "actor", actor: "alice", item: "sword" },
    ])
  })

  it("tells every other occupant of the room, not the actor", async () => {
    const { runtime, world, sessions, adapter, here, bobPlayer, sword } = abermudFixture()
    world.locate(sword, here)
    world.locate(bobPlayer, here)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "get sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(bob.output).toEqual([
      { kind: "taken", perspective: "observer", actor: "alice", item: "sword" },
    ])
  })

  it("asks what, given no object", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "get" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "get-what" }])
  })

  it("refuses an object that is not in the room", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "get sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-here" }])
  })

  it("refuses an object that is not takeable", async () => {
    const { runtime, world, adapter, here, statue } = abermudFixture()
    world.locate(statue, here)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "get statue" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-takeable" }])
    expect(world.locationOf(statue)).toBe(here)
  })

  it("has no output for a session controlling nothing", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-3")

    for (const item of adapter.parse({ session, raw: "get sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-controlling" }])
  })
})
