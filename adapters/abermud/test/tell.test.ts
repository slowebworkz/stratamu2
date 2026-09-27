import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("TELL", () => {
  it("delivers a private message to a named, currently-connected character", async () => {
    const { runtime, sessions, adapter } = abermudFixture()
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "tell bob hi there" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([{ kind: "speech", channel: "tell", perspective: "speaker", speaker: "alice", text: "hi there", addressee: "bob" }])
    expect(bob.output).toEqual([{ kind: "speech", channel: "tell", perspective: "listener", speaker: "alice", text: "hi there" }])
  })

  it("reports the target as not here when they have no active session", async () => {
    const { runtime, adapter } = abermudFixture()
    const alice = testSession("session-1", "alice")

    for (const item of adapter.parse({ session: alice, raw: "tell bob hi" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([{ kind: "refusal", reason: "target-absent", target: "bob" }])
  })

  it("reports an unknown character as not here", async () => {
    const { runtime, adapter } = abermudFixture()
    const alice = testSession("session-1", "alice")

    for (const item of adapter.parse({ session: alice, raw: "tell carol hi" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([{ kind: "refusal", reason: "target-absent", target: "carol" }])
  })
})
