import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("REMOVE", () => {
  it("stops wearing a worn object, silently -- the source has no success message either", async () => {
    const { runtime, world, adapter, alicePlayer, shield } = abermudFixture()
    world.locate(shield, alicePlayer)
    adapter.worn.add(shield)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "remove shield" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([])
    expect(adapter.worn.has(shield)).toBe(false)
  })

  it("asks for more, given no object", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "remove" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "tell-me-more" }])
  })

  it("says not wearing for a carried object that isn't worn", async () => {
    const { runtime, world, adapter, alicePlayer, shield } = abermudFixture()
    world.locate(shield, alicePlayer)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "remove shield" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-wearing" }])
  })

  it("says not wearing for an object the actor isn't even carrying", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "remove shield" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-wearing" }])
  })

  it("has no output for a session controlling nothing", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-3")

    for (const item of adapter.parse({ session, raw: "remove shield" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-controlling" }])
  })
})
