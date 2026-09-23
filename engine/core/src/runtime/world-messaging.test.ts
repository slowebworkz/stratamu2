import type { EngineState } from "@stratamu/engine-world"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import type { EntityId, PrincipalId, SessionId } from "@stratamu/primitives"
import { entityId, principalId, sessionId } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { Runtime } from "./runtime.ts"

/**
 * A domain probe, not a proof of infrastructure: the substrate (execution, state, session
 * boundary, control, movement) is settled enough now that the most useful thing an operation can
 * do is show what it demands, rather than prove another mechanism works.
 *
 *   Alice -> controls -> Alice entity -> says "hello" -> current location
 *     -> Alice session ("You say...")
 *     -> Bob session   ("alice says...")
 *     -> Carol session ("alice says...")
 *
 * What this reveals that movement didn't: fan-out needs to reach *currently connected* sessions,
 * not just "who owns this entity in principle" (`Control`, `PrincipalId -> EntityId`, survives a
 * disconnect). A principal can own an entity while offline, so a second, small, test-local map
 * tracks who is actually reachable right now: `Active`, `EntityId -> Session`.
 *
 * What this does *not* reveal a need for: any kind of `MessageBus`/`EventBus`/`Broadcaster`. The
 * handler is exactly `for (const recipient of recipients) { recipient.send(...) }` -- a plain
 * array, built from `WorldState.occupants` and `Active`, iterated directly. If that becomes
 * awkward, that would be a concrete reason to introduce an abstraction; it doesn't happen here.
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

/** Who owns which entity, the same shape the player-control proof settled. Survives a reconnect. */
type Control = Map<PrincipalId, EntityId>

/** Who is actually reachable right now. Different from Control: a principal can own an entity
 * while disconnected, in which case there is no live session to send it anything through. */
type Active = Map<EntityId, Session>

const say = workKind("test.say")

function sayWork(session: Session, control: Control, line: string) {
  const actor = session.principalId === undefined ? undefined : control.get(session.principalId)
  return work(say, { session, actor, line })
}

function setup() {
  const world = new WorldState()
  const engineState: EngineState = { world }
  const runtime = new Runtime({ engineState })
  const active: Active = new Map()
  runtime.handle(say, (task, context) => {
    const { session, actor, line } = task.work.input as {
      session: Session | undefined
      actor: EntityId | undefined
      line: string
    }
    if (actor === undefined) {
      session?.send("you are not controlling anything")
      return
    }
    session?.send(`You say, "${line}"`)

    const location = context.world?.locationOf(actor)
    if (location === undefined) {
      return
    }
    // A principal's name is the only thing resembling one in this proof (Entity has no name
    // field -- not invented for this); an NPC's own entity id stands in when there is no session.
    const speaker = session?.principalId ?? actor
    const occupantIds = [...(context.world?.occupants(location) ?? [])]
    const recipients = occupantIds
      .filter(occupantId => occupantId !== actor)
      .map(occupantId => active.get(occupantId))
      .filter((recipient): recipient is Session => recipient !== undefined)
    for (const recipient of recipients) {
      recipient.send(`${speaker} says, "${line}"`)
    }
  })
  return { runtime, world, active }
}

describe("world messaging probe", () => {
  it("says hello: the speaker, and every other occupant of the same location, hear the expected message", async () => {
    const { runtime, world, active } = setup()
    const room = entityId("room-1")
    world.add(entity(room, "test.room"))
    const alicePlayer = entityId("alice-player")
    const bobPlayer = entityId("bob-player")
    const carolPlayer = entityId("carol-player")
    world.add(entity(alicePlayer, "test.player"))
    world.add(entity(bobPlayer, "test.player"))
    world.add(entity(carolPlayer, "test.player"))
    world.locate(alicePlayer, room)
    world.locate(bobPlayer, room)
    world.locate(carolPlayer, room)
    const control: Control = new Map([
      [principalId("alice"), alicePlayer],
      [principalId("bob"), bobPlayer],
      [principalId("carol"), carolPlayer],
    ])
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    const carol = testSession("session-3", "carol")
    active.set(alicePlayer, alice)
    active.set(bobPlayer, bob)
    active.set(carolPlayer, carol)

    runtime.submit({ work: sayWork(alice, control, "hello") })
    await runtime.drain()

    expect(alice.output).toEqual(['You say, "hello"'])
    expect(bob.output).toEqual(['alice says, "hello"'])
    expect(carol.output).toEqual(['alice says, "hello"'])
  })

  it("does not deliver to an occupant of a different location", async () => {
    const { runtime, world, active } = setup()
    const roomA = entityId("room-a")
    const roomB = entityId("room-b")
    world.add(entity(roomA, "test.room"))
    world.add(entity(roomB, "test.room"))
    const alicePlayer = entityId("alice-player")
    const bobPlayer = entityId("bob-player")
    world.add(entity(alicePlayer, "test.player"))
    world.add(entity(bobPlayer, "test.player"))
    world.locate(alicePlayer, roomA)
    world.locate(bobPlayer, roomB)
    const control: Control = new Map([[principalId("alice"), alicePlayer]])
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    active.set(bobPlayer, bob)

    runtime.submit({ work: sayWork(alice, control, "hello") })
    await runtime.drain()

    expect(bob.output).toEqual([])
  })

  it("does not deliver to an owner who is not currently connected", async () => {
    const { runtime, world } = setup()
    const room = entityId("room-1")
    world.add(entity(room, "test.room"))
    const alicePlayer = entityId("alice-player")
    const bobPlayer = entityId("bob-player")
    world.add(entity(alicePlayer, "test.player"))
    world.add(entity(bobPlayer, "test.player"))
    world.locate(alicePlayer, room)
    world.locate(bobPlayer, room)
    const control: Control = new Map([
      [principalId("alice"), alicePlayer],
      [principalId("bob"), bobPlayer],
    ])
    const alice = testSession("session-1", "alice")
    // Bob owns bobPlayer but has no active session: not in `active` at all.

    // No assertion needs bob's output directly -- there is no session object to assert on. The
    // proof is that the task completes rather than failing: drain() resolving to 1 only means one
    // step happened, not that it succeeded, so the outcome itself has to be checked.
    const handle = runtime.submit({ work: sayWork(alice, control, "hello") })
    await runtime.drain()

    expect(await handle.settled).toEqual({ state: "completed" })
    expect(alice.output).toEqual(['You say, "hello"'])
  })

  it("lets an NPC/script say something with no Session or Principal at all", async () => {
    const { runtime, world, active } = setup()
    const room = entityId("room-1")
    world.add(entity(room, "test.room"))
    const goblin = entityId("goblin-1")
    const bystanderPlayer = entityId("bystander-player")
    world.add(entity(goblin, "test.npc"))
    world.add(entity(bystanderPlayer, "test.player"))
    world.locate(goblin, room)
    world.locate(bystanderPlayer, room)
    const bystander = testSession("session-1", "bystander")
    active.set(bystanderPlayer, bystander)

    runtime.submit({ work: work(say, { session: undefined, actor: goblin, line: "grr" }) })
    await runtime.drain()

    expect(bystander.output).toEqual(['goblin-1 says, "grr"'])
  })
})
