import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("DROP", () => {
  it("sets down a carried object into the actor's current room", async () => {
    const { runtime, world, adapter, here, alicePlayer, sword } = abermudFixture()
    world.locate(sword, alicePlayer)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "drop sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([
      { kind: "dropped", perspective: "actor", actor: "alice", item: "sword" },
    ])
    expect(world.locationOf(sword)).toBe(here)
    expect([...world.occupants(alicePlayer)]).not.toContain(sword)
  })

  it("tells every other occupant of the room, not the actor", async () => {
    const { runtime, world, sessions, adapter, here, alicePlayer, bobPlayer, sword } =
      abermudFixture()
    world.locate(sword, alicePlayer)
    world.locate(bobPlayer, here)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "drop sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(bob.output).toEqual([
      { kind: "dropped", perspective: "observer", actor: "alice", item: "sword" },
    ])
  })

  it("asks what, given no object", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "drop" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "drop-what" }])
  })

  it("refuses an object the actor is not carrying", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "drop sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-carrying" }])
  })

  it("has no output for a session controlling nothing", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-3")

    for (const item of adapter.parse({ session, raw: "drop sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-controlling" }])
  })
})
