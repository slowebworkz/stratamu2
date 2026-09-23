import type { EngineState } from "@stratamu/engine-world"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import type { EntityId, PrincipalId, SessionId } from "@stratamu/primitives"
import { entityId, principalId, sessionId } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { Runtime } from "./runtime.ts"

/**
 * The first proof that reaches all the way to a real `WorldState` mutation, not just a read:
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
 * business). `Session`, `Control` and `Exits` all stay local to this test, for the same reason
 * they did in the session-boundary and player-control proofs: none of their real shapes are
 * settled, and this is the same kind of proof that settles a contract instead of guessing one.
 */

interface Session {
  readonly id: SessionId
  readonly principalId: PrincipalId | undefined
  readonly output: unknown[]
  send(message: unknown): void
}

function testSession(id: string, principal?: string): Session {
  const output: unknown[] = []
  return {
    id: sessionId(id),
    principalId: principal === undefined ? undefined : principalId(principal),
    output,
    send(message) {
      output.push(message)
    },
  }
}

/** Who currently controls which entity, the same shape the player-control proof settled. */
type Control = Map<PrincipalId, EntityId>

/** Which direction leads where, from a given room. Adapter data: `WorldState` never sees this,
 * only the `locate` call the handler makes once it has consulted it. */
type Exits = Map<EntityId, Map<string, EntityId>>

const move = workKind("test.move")

function moveWork(session: Session, control: Control, direction: string) {
  const actor = session.principalId === undefined ? undefined : control.get(session.principalId)
  return work(move, { session, actor, direction })
}

function setup() {
  const world = new WorldState()
  const exits: Exits = new Map()
  const engineState: EngineState = { world }
  const runtime = new Runtime({ engineState })
  runtime.handle(move, (task, context) => {
    const { session, actor, direction } = task.work.input as {
      session: Session | undefined
      actor: EntityId | undefined
      direction: string
    }
    if (actor === undefined) {
      session?.send("you are not controlling anything")
      return
    }
    // The movement rule: is there a valid destination from here, in this direction? This is the
    // whole rule boundary -- an ordinary check against adapter data, before WorldState is ever
    // touched. Nothing about it belongs in core.
    const currentRoom = context.world?.locationOf(actor)
    const destination =
      currentRoom === undefined ? undefined : exits.get(currentRoom)?.get(direction)
    if (destination === undefined) {
      session?.send("you cannot go that way")
      return
    }
    context.world?.locate(actor, destination)
    session?.send(`you go ${direction}`)
  })
  return { runtime, world, exits }
}

/** Room A --north--> Room B, with a player entity starting in Room A. The smallest layout that
 * can answer "did the entity actually move". */
function twoRooms(world: WorldState, exits: Exits, playerId: string) {
  const roomA = entityId("room-a")
  const roomB = entityId("room-b")
  world.add(entity(roomA, "test.room"))
  world.add(entity(roomB, "test.room"))
  const player = entityId(playerId)
  world.add(entity(player, "test.player"))
  world.locate(player, roomA)
  exits.set(roomA, new Map([["north", roomB]]))
  return { roomA, roomB, player }
}

describe("world movement proof", () => {
  it("moves the controlled entity through a valid exit, changing its recorded location", async () => {
    const { runtime, world, exits } = setup()
    const { roomB, player } = twoRooms(world, exits, "player-1")
    const control: Control = new Map([[principalId("alice"), player]])
    const session = testSession("session-1", "alice")

    runtime.submit({ work: moveWork(session, control, "north") })
    await runtime.drain()

    expect(world.locationOf(player)).toBe(roomB)
  })

  it("does not mutate state for an invalid destination", async () => {
    const { runtime, world, exits } = setup()
    const { roomA, player } = twoRooms(world, exits, "player-1")
    const control: Control = new Map([[principalId("alice"), player]])
    const session = testSession("session-1", "alice")

    // No exit south exists from room A.
    runtime.submit({ work: moveWork(session, control, "south") })
    await runtime.drain()

    expect(world.locationOf(player)).toBe(roomA)
    expect(session.output).toEqual(["you cannot go that way"])
  })

  it("associates the movement with the principal/session making it, not any other", async () => {
    const { runtime, world, exits } = setup()
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
    exits.set(roomA, new Map([["north", roomB]]))
    const control: Control = new Map([
      [principalId("alice"), alicePlayer],
      [principalId("bob"), bobPlayer],
    ])
    const alice = testSession("session-1", "alice")

    runtime.submit({ work: moveWork(alice, control, "north") })
    await runtime.drain()

    expect(world.locationOf(alicePlayer)).toBe(roomB)
    expect(world.locationOf(bobPlayer)).toBe(roomA)
  })

  it("keeps controlling, and moving, the same entity across a reconnect", async () => {
    const { runtime, world, exits } = setup()
    const roomA = entityId("room-a")
    const roomB = entityId("room-b")
    const roomC = entityId("room-c")
    world.add(entity(roomA, "test.room"))
    world.add(entity(roomB, "test.room"))
    world.add(entity(roomC, "test.room"))
    const player = entityId("player-1")
    world.add(entity(player, "test.player"))
    world.locate(player, roomA)
    exits.set(roomA, new Map([["north", roomB]]))
    exits.set(roomB, new Map([["north", roomC]]))
    const control: Control = new Map([[principalId("alice"), player]])

    const firstConnection = testSession("session-1", "alice")
    runtime.submit({ work: moveWork(firstConnection, control, "north") })
    await runtime.drain()
    expect(world.locationOf(player)).toBe(roomB)

    // Disconnect. A new connection gets a new SessionId; the principal, and so the control
    // mapping keyed on it, is untouched by that.
    const reconnected = testSession("session-2", "alice")
    runtime.submit({ work: moveWork(reconnected, control, "north") })
    await runtime.drain()

    expect(firstConnection.id).not.toBe(reconnected.id)
    expect(world.locationOf(player)).toBe(roomC)
  })

  it("produces the expected session-facing result for a successful move", async () => {
    const { runtime, world, exits } = setup()
    const { player } = twoRooms(world, exits, "player-1")
    const control: Control = new Map([[principalId("alice"), player]])
    const session = testSession("session-1", "alice")

    runtime.submit({ work: moveWork(session, control, "north") })
    await runtime.drain()

    expect(session.output).toEqual(["you go north"])
  })

  it("still lets an NPC-driven move run with no session or principal at all", async () => {
    const { runtime, world, exits } = setup()
    const { roomB, player } = twoRooms(world, exits, "goblin-1")

    runtime.submit({ work: work(move, { session: undefined, actor: player, direction: "north" }) })
    await runtime.drain()

    expect(world.locationOf(player)).toBe(roomB)
  })
})
