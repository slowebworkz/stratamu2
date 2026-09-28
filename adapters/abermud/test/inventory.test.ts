import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("INVENTORY", () => {
  it("lists what the actor is carrying", async () => {
    const { runtime, world, adapter, alicePlayer, sword } = abermudFixture()
    world.locate(sword, alicePlayer)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "inventory" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "inventory", items: ["sword"] }])
  })

  it("recognizes I and INV as the same command", async () => {
    const { runtime, world, adapter, alicePlayer, sword } = abermudFixture()
    world.locate(sword, alicePlayer)

    for (const raw of ["i", "inv"]) {
      const session = testSession(`session-${raw}`, "alice")
      for (const item of adapter.parse({ session, raw })) {
        runtime.submit({ work: item })
      }
      await runtime.drain()
      expect(session.output).toEqual([{ kind: "inventory", items: ["sword"] }])
    }
  })

  it("says nothing carried, carrying nothing", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "inventory" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "inventory", items: [] }])
  })

  it("has no output for a session controlling nothing", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-3")

    for (const item of adapter.parse({ session, raw: "inventory" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-controlling" }])
  })
})
