import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FilePersonaStore } from "../src/persistence/index.ts"
import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("QUIT", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "abermud-quit-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("confirms, drops carried items into the current room, and saves the persona", async () => {
    const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
    const { runtime, world, adapter, here, alicePlayer, sword } = abermudFixture({ personaStore })
    world.locate(sword, alicePlayer)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "quit" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "quit", perspective: "actor", name: "alice" }])
    expect(world.locationOf(sword)).toBe(here)
    expect([...world.occupants(alicePlayer)]).toEqual([])
    expect(await personaStore.load("alice")).toEqual({
      name: "alice",
      score: 0,
      strength: 10,
      sex: 0,
      level: 1,
    })
  })

  it("still quits without a configured store -- saving is a side effect, not what was asked for", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "quit" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "quit", perspective: "actor", name: "alice" }])
  })

  it("tells every other occupant of the room, not the actor", async () => {
    const { runtime, world, sessions, adapter, here, bobPlayer } = abermudFixture()
    world.locate(bobPlayer, here)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "quit" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(bob.output).toEqual([{ kind: "quit", perspective: "observer", name: "alice" }])
  })

  it("leaves the character's own location alone -- the same choice already made for a disconnect", async () => {
    const { runtime, world, adapter, here, alicePlayer } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "quit" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(world.locationOf(alicePlayer)).toBe(here)
  })

  it("has no output for a session controlling nothing", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-3")

    for (const item of adapter.parse({ session, raw: "quit" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-controlling" }])
  })
})
