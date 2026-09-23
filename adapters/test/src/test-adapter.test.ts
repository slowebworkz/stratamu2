import { Runtime } from "@stratamu/engine-core"
import { Sessions } from "@stratamu/engine-sessions"
import type { EngineState } from "@stratamu/engine-world"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import { entityId, principalId } from "@stratamu/primitives"
import { work } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { look } from "./work-kinds.ts"
import { TestAdapter } from "./test-adapter.ts"
import { testSession } from "./test-session.ts"

/**
 * The success criterion the game-adapter-contract branch exists to satisfy:
 *
 *   raw/session input -> adapter parser -> adapter-owned Work -> Runtime
 *     -> adapter-owned handler -> WorldState / Session
 *
 * with no test-specific handler registration anywhere in this file: every `Runtime` below only
 * ever calls `adapter.registerHandlers(runtime)`, never its own inline `runtime.handle(...)`.
 * `test.look`/`test.move`/`test.say`'s actual logic now lives in exactly one place
 * (`test-adapter.ts`), not re-declared per test file -- the same consolidation `Session` itself
 * went through once enough probes needed it. `session-boundary.test.ts`, `player-control.test.ts`,
 * `world-movement.test.ts`, `world-messaging.test.ts` and `session-lifecycle.test.ts` are migrated
 * to import this adapter instead of their own local copies; their own docblocks note what changed.
 */

function setup() {
  const world = new WorldState()
  const sessions = new Sessions()
  const engineState: EngineState = { world, sessions }
  const runtime = new Runtime({ engineState })
  const adapter = new TestAdapter()
  adapter.registerHandlers(runtime)
  return { runtime, world, sessions, adapter }
}

describe("TestAdapter", () => {
  it("routes raw input through parse -> Work -> Runtime -> its own look handler -> Session", async () => {
    const { runtime, world, adapter } = setup()
    world.add(entity(entityId("player-1"), "test.player"))
    adapter.control.set(principalId("alice"), entityId("player-1"))
    const alice = testSession("session-1", "alice")

    const parsed = adapter.parse({ session: alice, raw: "look" })
    expect(parsed).toHaveLength(1)
    for (const item of parsed) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual(["you are player-1, a test.player"])
  })

  it("produces no Work for input the grammar does not recognize", () => {
    const { adapter } = setup()
    const alice = testSession("session-1", "alice")

    expect(adapter.parse({ session: alice, raw: "xyzzy" })).toEqual([])
  })

  it("moves the controlled entity through a valid exit, and refuses an invalid one", async () => {
    const { runtime, world, adapter } = setup()
    const roomA = entityId("room-a")
    const roomB = entityId("room-b")
    world.add(entity(roomA, "test.room"))
    world.add(entity(roomB, "test.room"))
    world.add(entity(entityId("player-1"), "test.player"))
    world.locate(entityId("player-1"), roomA)
    adapter.exits.set(roomA, new Map([["north", roomB]]))
    adapter.control.set(principalId("alice"), entityId("player-1"))
    const alice = testSession("session-1", "alice")

    for (const item of adapter.parse({ session: alice, raw: "move south" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()
    expect(world.locationOf(entityId("player-1"))).toBe(roomA)
    expect(alice.output).toEqual(["you cannot go that way"])

    for (const item of adapter.parse({ session: alice, raw: "move north" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()
    expect(world.locationOf(entityId("player-1"))).toBe(roomB)
    expect(alice.output).toEqual(["you cannot go that way", "you go north"])
  })

  it("fans a say out to every other occupant with an active session, resolved through control and sessions", async () => {
    const { runtime, world, sessions, adapter } = setup()
    const room = entityId("room-1")
    world.add(entity(room, "test.room"))
    const alicePlayer = entityId("alice-player")
    const bobPlayer = entityId("bob-player")
    world.add(entity(alicePlayer, "test.player"))
    world.add(entity(bobPlayer, "test.player"))
    world.locate(alicePlayer, room)
    world.locate(bobPlayer, room)
    adapter.control.set(principalId("alice"), alicePlayer)
    adapter.control.set(principalId("bob"), bobPlayer)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "say hello" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual(['You say, "hello"'])
    expect(bob.output).toEqual(['alice says, "hello"'])

    // Bob disconnects: he stops hearing anything new, but nothing about control or the entity
    // itself changes because of it.
    sessions.disconnect(bob.id)
    for (const item of adapter.parse({ session: alice, raw: "say still there?" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(bob.output).toEqual(['alice says, "hello"'])
    expect(adapter.control.get(principalId("bob"))).toBe(bobPlayer)
    expect(world.has(bobPlayer)).toBe(true)
  })

  it("still lets an NPC act with no Session, and so no parse call, at all", async () => {
    const { runtime, world } = setup()
    world.add(entity(entityId("goblin-1"), "test.npc"))

    runtime.submit({ work: work(look, { session: undefined, actor: entityId("goblin-1") }) })

    await expect(runtime.drain()).resolves.toBe(1)
  })

  it("keeps controlling the same entity across a reconnect, entirely through adapter-owned state", async () => {
    const { runtime, world, adapter } = setup()
    world.add(entity(entityId("player-1"), "test.player"))
    adapter.control.set(principalId("alice"), entityId("player-1"))

    const firstConnection = testSession("session-1", "alice")
    for (const item of adapter.parse({ session: firstConnection, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    const reconnected = testSession("session-2", "alice")
    for (const item of adapter.parse({ session: reconnected, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(firstConnection.id).not.toBe(reconnected.id)
    expect(firstConnection.output).toEqual(["you are player-1, a test.player"])
    expect(reconnected.output).toEqual(["you are player-1, a test.player"])
  })
})
