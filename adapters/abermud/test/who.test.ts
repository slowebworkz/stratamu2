import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("WHO", () => {
  it("lists every currently-connected character", async () => {
    const { runtime, sessions, adapter } = abermudFixture()
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "who" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([{ kind: "players", names: ["alice", "bob"] }])
  })

  it("lists the caller when they are the only one online", async () => {
    const { runtime, sessions, adapter } = abermudFixture()
    const alice = testSession("session-1", "alice")
    sessions.open(alice)

    for (const item of adapter.parse({ session: alice, raw: "who" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([{ kind: "players", names: ["alice"] }])
  })

  it("reports no one online when no character is connected", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1")

    for (const item of adapter.parse({ session, raw: "who" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "players", names: [] }])
  })
})
