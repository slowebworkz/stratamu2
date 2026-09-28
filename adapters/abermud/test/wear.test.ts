import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("WEAR", () => {
  it("wears a carried wearable object", async () => {
    const { runtime, world, adapter, alicePlayer, shield } = abermudFixture()
    world.locate(shield, alicePlayer)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "wear shield" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "worn" }])
    expect(adapter.worn.has(shield)).toBe(true)
  })

  it("asks for more, given no object", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "wear" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "tell-me-more" }])
  })

  it("refuses an object the actor is not carrying", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "wear shield" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-carrying-this" }])
  })

  it("refuses a carried object that is not wearable", async () => {
    const { runtime, world, adapter, alicePlayer, sword } = abermudFixture()
    world.locate(sword, alicePlayer)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "wear sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-wearable" }])
  })

  it("refuses something already worn", async () => {
    const { runtime, world, adapter, alicePlayer, shield } = abermudFixture()
    world.locate(shield, alicePlayer)
    adapter.worn.add(shield)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "wear shield" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "already-wearing" }])
  })

  it("has no output for a session controlling nothing", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-3")

    for (const item of adapter.parse({ session, raw: "wear shield" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-controlling" }])
  })
})
