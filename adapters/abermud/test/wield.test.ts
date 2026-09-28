import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("WIELD", () => {
  it("wields a carried weapon", async () => {
    const { runtime, world, adapter, alicePlayer, sword } = abermudFixture()
    world.locate(sword, alicePlayer)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "wield sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "wielded" }])
    expect(adapter.wielding.get(alicePlayer)).toBe(sword)
  })

  it("asks which weapon, given no object", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "wield" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "wield-what" }])
  })

  it("refuses a weapon the actor is not carrying", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "wield sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "no-such-weapon" }])
  })

  it("refuses a carried object that is not a weapon", async () => {
    const { runtime, world, adapter, alicePlayer, shield } = abermudFixture()
    world.locate(shield, alicePlayer)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "wield shield" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-a-weapon" }])
    expect(adapter.wielding.has(alicePlayer)).toBe(false)
  })

  it("has no output for a session controlling nothing", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-3")

    for (const item of adapter.parse({ session, raw: "wield sword" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-controlling" }])
  })
})
