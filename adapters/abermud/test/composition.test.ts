import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Engine } from "@stratamu/engine-core"
import { entity } from "@stratamu/entity"
import { entityId, principalId } from "@stratamu/primitives"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { AberMUDAdapter } from "../src/adapter.ts"
import { FilePersonaStore } from "../src/persistence/index.ts"
import { testSession } from "./fixtures/session.ts"

/**
 * Proves `AberMUDAdapter` composes through `@stratamu/engine-core`'s `Engine`:
 *
 *   create Engine(AberMUDAdapter)
 *     -> session receives "look" / "north" / "say hello"
 *     -> engine.receive(input)
 *     -> adapter.parse(...)
 *     -> Work
 *     -> Runtime
 *     -> abermud.look / abermud.move / abermud.say handler
 *     -> WorldState
 *     -> session output
 */
describe("AberMUD engine composition", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "abermud-composition-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('"look" -> Engine.receive -> abermud.look -> Runtime -> room description', async () => {
    const adapter = new AberMUDAdapter()
    const engine = new Engine(adapter)
    const here = entityId("here")
    engine.world.add(entity(here, "abermud.room"))
    const alicePlayer = entityId("alice-player")
    engine.world.add(entity(alicePlayer, "abermud.player"))
    engine.world.locate(alicePlayer, here)
    adapter.rooms.set(here, {
      id: here,
      number: 1,
      name: "Here",
      description: "A small starting room.",
      exits: new Map(),
    })
    adapter.control.set(principalId("alice"), alicePlayer)
    const session = testSession("session-1", "alice")

    engine.receive({ session, raw: "look" })
    await engine.runtime.drain()

    expect(session.output).toEqual([{ kind: "room", name: "Here", description: "A small starting room.", occupants: [] }])
  })

  it('"north" -> Engine.receive -> abermud.move -> Runtime -> WorldState mutation', async () => {
    const adapter = new AberMUDAdapter()
    const engine = new Engine(adapter)
    const here = entityId("here")
    const there = entityId("there")
    engine.world.add(entity(here, "abermud.room"))
    engine.world.add(entity(there, "abermud.room"))
    const alicePlayer = entityId("alice-player")
    engine.world.add(entity(alicePlayer, "abermud.player"))
    engine.world.locate(alicePlayer, here)
    adapter.rooms.set(here, {
      id: here,
      number: 1,
      name: "Here",
      description: "A small starting room.",
      exits: new Map([["north", there]]),
    })
    adapter.rooms.set(there, {
      id: there,
      number: 2,
      name: "There",
      description: "A room further along.",
      exits: new Map([["south", here]]),
    })
    adapter.control.set(principalId("alice"), alicePlayer)
    const session = testSession("session-1", "alice")

    engine.receive({ session, raw: "north" })
    await engine.runtime.drain()

    expect(engine.world.locationOf(alicePlayer)).toBe(there)
  })

  it('"say hello" -> Engine.receive -> abermud.say -> Runtime -> recipient output', async () => {
    const adapter = new AberMUDAdapter()
    const engine = new Engine(adapter)
    const here = entityId("here")
    engine.world.add(entity(here, "abermud.room"))
    const alicePlayer = entityId("alice-player")
    const bobPlayer = entityId("bob-player")
    engine.world.add(entity(alicePlayer, "abermud.player"))
    engine.world.add(entity(bobPlayer, "abermud.player"))
    engine.world.locate(alicePlayer, here)
    engine.world.locate(bobPlayer, here)
    adapter.control.set(principalId("alice"), alicePlayer)
    adapter.control.set(principalId("bob"), bobPlayer)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    engine.sessions.open(alice)
    engine.sessions.open(bob)

    engine.receive({ session: alice, raw: "say hello" })
    await engine.runtime.drain()

    expect(alice.output).toEqual([{ kind: "speech", channel: "say", perspective: "speaker", speaker: "alice", text: "hello" }])
    expect(bob.output).toEqual([{ kind: "speech", channel: "say", perspective: "listener", speaker: "alice", text: "hello" }])
  })

  it('"save" -> Engine.receive -> abermud.save -> Runtime -> FilePersonaStore', async () => {
    const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
    const adapter = new AberMUDAdapter({ personaStore })
    const engine = new Engine(adapter)
    const alicePlayer = entityId("alice-player")
    engine.world.add(entity(alicePlayer, "abermud.player"))
    adapter.control.set(principalId("alice"), alicePlayer)
    adapter.personas.set(alicePlayer, {
      name: "alice",
      score: 100,
      strength: 10,
      sex: 0,
      level: 2,
    })
    const session = testSession("session-1", "alice")

    engine.receive({ session, raw: "save" })
    await engine.runtime.drain()

    expect(session.output).toEqual(["Saving alice"])
    expect(await personaStore.load("alice")).toEqual({
      name: "alice",
      score: 100,
      strength: 10,
      sex: 0,
      level: 2,
    })
  })

  it("routes input the grammar does not recognize to nothing, through the same entry point", () => {
    const adapter = new AberMUDAdapter()
    const engine = new Engine(adapter)
    const session = testSession("session-1", "alice")

    engine.receive({ session, raw: "xyzzy" })

    expect(engine.runtime.pending).toBe(0)
    expect(session.output).toEqual([])
  })
})
