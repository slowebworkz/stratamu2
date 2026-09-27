import { entityId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("MOVE", () => {
  it("moves through a valid exit and shows the destination", async () => {
    const { runtime, world, adapter, alicePlayer, there } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "north" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(world.locationOf(alicePlayer)).toBe(there)
    expect(session.output).toEqual([{ kind: "room", name: "There", description: "A room further along.", occupants: [entityId("bob-player"), entityId("goblin")] }])
  })

  it("refuses an exit that doesn't exist", async () => {
    const { runtime, world, adapter, alicePlayer, here } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "south" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(world.locationOf(alicePlayer)).toBe(here)
    expect(session.output).toEqual([{ kind: "refusal", reason: "no-exit" }])
  })

  it("resolves a single-letter alias to the canonical direction", async () => {
    const { runtime, world, adapter, alicePlayer, there } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "n" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(world.locationOf(alicePlayer)).toBe(there)
  })

  it("resolves GO <direction>", async () => {
    const { runtime, world, adapter, alicePlayer, there } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "go north" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(world.locationOf(alicePlayer)).toBe(there)
  })
})
