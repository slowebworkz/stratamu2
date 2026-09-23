import { Runtime } from "@stratamu/engine-core"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import { entityId, principalId } from "@stratamu/primitives"
import { work } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { TestAdapter } from "../test-adapter.ts"
import { testSession } from "../test-session.ts"
import { move } from "../work-kinds.ts"

/**
 * The first proof that reached all the way to a real `WorldState` mutation, not just a read:
 *
 *   Session -> Principal -> controlled Entity -> movement Work -> Runtime
 *     -> movement rule -> WorldState mutation -> session output
 *
 * The rule question this exists to answer: where does "is this move allowed" actually live? The
 * answer, consistent with every proof before this one finding no new core mechanism was needed:
 * nowhere in core. It's an ordinary `if` in the handler, checked before ever calling
 * `world.locate`. No `AuthorityManager`, no generic rule engine -- `WorldState.locate` only
 * refuses a destination that does not exist (data integrity, the same category as `add`'s
 * duplicate-id check), never "may this entity move there" (a game rule, entirely the handler's
 * business).
 *
 * Originally `engine/core/src/runtime/world-movement.test.ts`, with a local `Session`/`Control`/
 * `Exits`/`move` handler exactly like this adapter's own. Relocated here once the adapter existed
 * to actually own that implementation: `engine/core` cannot depend on any one adapter, so a probe
 * that exercises a real adapter has to live where the adapter does, not where `Runtime` does.
 * Routes through `adapter.parse` now, not a hand-built `Work`, for every session-driven move --
 * the fuller path (`raw input -> parse -> Work -> Runtime -> handler`) the original proof did not
 * need to demonstrate because the adapter itself did not exist yet.
 */

function setup() {
  const world = new WorldState()
  const adapter = new TestAdapter()
  const runtime = new Runtime({ engineState: { world } })
  adapter.registerHandlers(runtime)
  return { runtime, world, adapter }
}

/** Room A --north--> Room B, with a player entity starting in Room A. The smallest layout that
 * can answer "did the entity actually move". */
function twoRooms(world: WorldState, adapter: TestAdapter, playerId: string) {
  const roomA = entityId("room-a")
  const roomB = entityId("room-b")
  world.add(entity(roomA, "test.room"))
  world.add(entity(roomB, "test.room"))
  const player = entityId(playerId)
  world.add(entity(player, "test.player"))
  world.locate(player, roomA)
  adapter.exits.set(roomA, new Map([["north", roomB]]))
  return { roomA, roomB, player }
}

describe("world movement proof", () => {
  it("moves the controlled entity through a valid exit, changing its recorded location", async () => {
    const { runtime, world, adapter } = setup()
    const { roomB, player } = twoRooms(world, adapter, "player-1")
    adapter.control.set(principalId("alice"), player)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "move north" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(world.locationOf(player)).toBe(roomB)
  })

  it("does not mutate state for an invalid destination", async () => {
    const { runtime, world, adapter } = setup()
    const { roomA, player } = twoRooms(world, adapter, "player-1")
    adapter.control.set(principalId("alice"), player)
    const session = testSession("session-1", "alice")

    // No exit south exists from room A.
    for (const item of adapter.parse({ session, raw: "move south" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(world.locationOf(player)).toBe(roomA)
    expect(session.output).toEqual(["you cannot go that way"])
  })

  it("associates the movement with the principal/session making it, not any other", async () => {
    const { runtime, world, adapter } = setup()
    const roomA = entityId("room-a")
    const roomB = entityId("room-b")
    world.add(entity(roomA, "test.room"))
    world.add(entity(roomB, "test.room"))
    const alicePlayer = entityId("alice-player")
    const bobPlayer = entityId("bob-player")
    world.add(entity(alicePlayer, "test.player"))
    world.add(entity(bobPlayer, "test.player"))
    world.locate(alicePlayer, roomA)
    world.locate(bobPlayer, roomA)
    adapter.exits.set(roomA, new Map([["north", roomB]]))
    adapter.control.set(principalId("alice"), alicePlayer)
    adapter.control.set(principalId("bob"), bobPlayer)
    const alice = testSession("session-1", "alice")

    for (const item of adapter.parse({ session: alice, raw: "move north" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(world.locationOf(alicePlayer)).toBe(roomB)
    expect(world.locationOf(bobPlayer)).toBe(roomA)
  })

  it("keeps controlling, and moving, the same entity across a reconnect", async () => {
    const { runtime, world, adapter } = setup()
    const roomA = entityId("room-a")
    const roomB = entityId("room-b")
    const roomC = entityId("room-c")
    world.add(entity(roomA, "test.room"))
    world.add(entity(roomB, "test.room"))
    world.add(entity(roomC, "test.room"))
    const player = entityId("player-1")
    world.add(entity(player, "test.player"))
    world.locate(player, roomA)
    adapter.exits.set(roomA, new Map([["north", roomB]]))
    adapter.exits.set(roomB, new Map([["north", roomC]]))
    adapter.control.set(principalId("alice"), player)

    const firstConnection = testSession("session-1", "alice")
    for (const item of adapter.parse({ session: firstConnection, raw: "move north" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()
    expect(world.locationOf(player)).toBe(roomB)

    // Disconnect. A new connection gets a new SessionId; the principal, and so the control
    // mapping keyed on it, is untouched by that.
    const reconnected = testSession("session-2", "alice")
    for (const item of adapter.parse({ session: reconnected, raw: "move north" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(firstConnection.id).not.toBe(reconnected.id)
    expect(world.locationOf(player)).toBe(roomC)
  })

  it("produces the expected session-facing result for a successful move", async () => {
    const { runtime, world, adapter } = setup()
    const { player } = twoRooms(world, adapter, "player-1")
    adapter.control.set(principalId("alice"), player)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "move north" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual(["you go north"])
  })

  it("still lets an NPC-driven move run with no session or principal at all", async () => {
    const { runtime, world, adapter } = setup()
    const { roomB, player } = twoRooms(world, adapter, "goblin-1")

    runtime.submit({ work: work(move, { session: undefined, actor: player, direction: "north" }) })
    await runtime.drain()

    expect(world.locationOf(player)).toBe(roomB)
  })
})
