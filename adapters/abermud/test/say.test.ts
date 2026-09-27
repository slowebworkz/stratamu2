import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("SAY", () => {
  it("fans out to every other occupant with an active session", async () => {
    const { runtime, world, sessions, adapter, here, bobPlayer } = abermudFixture()
    world.locate(bobPlayer, here)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "say hello" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([
      { kind: "speech", channel: "say", perspective: "speaker", speaker: "alice", text: "hello" },
    ])
    expect(bob.output).toEqual([
      { kind: "speech", channel: "say", perspective: "listener", speaker: "alice", text: "hello" },
    ])
  })

  it("says nothing to an occupant with no active session", async () => {
    const { runtime, world, adapter, here, bobPlayer } = abermudFixture()
    world.locate(bobPlayer, here)
    const alice = testSession("session-1", "alice")

    for (const item of adapter.parse({ session: alice, raw: "say hello" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([
      { kind: "speech", channel: "say", perspective: "speaker", speaker: "alice", text: "hello" },
    ])
  })
})
