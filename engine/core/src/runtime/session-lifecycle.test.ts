import type { Session } from "@stratamu/engine-sessions"
import { Sessions } from "@stratamu/engine-sessions"
import type { EngineState } from "@stratamu/engine-world"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import type { EntityId, PrincipalId } from "@stratamu/primitives"
import { entityId, principalId, sessionId } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { Runtime } from "./runtime.ts"

/**
 * A domain probe: moves the currently test-local notion of active sessions -- the `Active` map
 * `world-messaging.test.ts` introduced -- into a real, reusable `Sessions` (`@stratamu/engine-
 * sessions`), threaded through `TaskContext.sessions` the same way `WorldState` is threaded
 * through `TaskContext.world`. Proves the lifecycle the earlier probes only ever exercised one
 * step of at a time:
 *
 *   open -> SessionId assigned -> associate PrincipalId -> associate/control EntityId -> active
 *     -> receive output -> disconnect -> inactive
 *
 * while confirming what a disconnect does and does not do:
 *
 *   Principal survives (Control is untouched)
 *   Entity survives (WorldState is untouched)
 *   SessionId does not survive (Sessions stops resolving it, permanently)
 *
 * and that an NPC still needs no Session, and so no Sessions registration, at all.
 *
 * What stays deliberately out of scope, per the same reasoning every earlier probe used: no
 * networking (the same in-process fake `Session` every prior probe used); no authentication (a
 * `Session`'s `principalId` is still set once, at construction, by whoever authenticated it --
 * `Sessions` never assigns or checks one); no persistence (`Sessions` is runtime state, in-memory
 * only, the same as `WorldState`); no message bus (the `say` capstone below is still exactly
 * `for (const recipient of recipients) { recipient.send(...) }`).
 *
 * The one architectural decision this probe exists to keep: `Sessions` (`SessionId -> Session`,
 * "who is reachable right now") stays a different structure from `Control` (`PrincipalId ->
 * EntityId`, "who owns what"), with different lifetimes. `Control` stays exactly what it always
 * was here -- an adapter-local `Map`, not promoted into `@stratamu/engine-sessions` alongside
 * `Sessions` -- because ownership is a game-rule concern, not a session-lifecycle one. A
 * disconnect only ever calls `sessions.disconnect(id)`: never `control.delete(...)`, never
 * `world.remove(...)`.
 */

/** The real `Session` contract now, plus an `output` array this probe's fake exposes purely for
 * assertions -- not part of `Session` itself, the same as every earlier probe's fake. */
interface TestSession extends Session {
  readonly output: unknown[]
}

function testSession(id: string, principal?: string): TestSession {
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

/** Who owns which entity: unchanged from the player-control and world-messaging probes, and
 * deliberately still not part of `@stratamu/engine-sessions` -- see the file docblock. */
type Control = Map<PrincipalId, EntityId>

/** The reverse of `Control`: which principal, if any, currently owns this entity. Computed on
 * demand by scanning `Control`, the same "no maintained index until one is needed" reasoning
 * `WorldState.occupants` and `Sessions.activeFor` both settled on -- `Control` stays a plain
 * `Map`, so this is the adapter's own concern, not something either engine package provides. */
function principalControlling(control: Control, entity: EntityId): PrincipalId | undefined {
  for (const [principal, controlled] of control) {
    if (controlled === entity) {
      return principal
    }
  }
  return undefined
}

const look = workKind("test.look")

/** The adapter's parser, as in the player-control proof: resolves the session's actor once, from
 * `control`, and carries the live `Session` in `Work.input` -- unchanged by `Sessions` existing,
 * because a session addressing its own output never needed a lookup, only fan-out to others did. */
function lookWork(session: Session, control: Control) {
  const actor = session.principalId === undefined ? undefined : control.get(session.principalId)
  return work(look, { session, actor })
}

function setupLook() {
  const world = new WorldState()
  const sessions = new Sessions()
  const engineState: EngineState = { world, sessions }
  const runtime = new Runtime({ engineState })
  const control: Control = new Map()
  runtime.handle(look, (task, context) => {
    const { session, actor } = task.work.input as {
      session: Session | undefined
      actor: EntityId | undefined
    }
    if (actor === undefined) {
      session?.send("you are not controlling anything")
      return
    }
    const self = context.world?.get(actor)
    session?.send(self === undefined ? "you do not exist" : `you are ${self.id}, a ${self.type}`)
  })
  return { runtime, world, sessions, control }
}

const say = workKind("test.say")

function sayWork(session: Session, control: Control, line: string) {
  const actor = session.principalId === undefined ? undefined : control.get(session.principalId)
  return work(say, { session, actor, line })
}

function setupSay() {
  const world = new WorldState()
  const sessions = new Sessions()
  const engineState: EngineState = { world, sessions }
  const runtime = new Runtime({ engineState })
  const control: Control = new Map()
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
    const speaker = session?.principalId ?? actor
    const occupantIds = [...(context.world?.occupants(location) ?? [])]
    // Where world-messaging.test.ts resolved a recipient directly from a bespoke
    // `EntityId -> Session` map, this resolves it in two real steps: an occupant's controlling
    // principal (Control, adapter-local), then that principal's active session (Sessions,
    // engine-level) -- proving context.sessions is what replaces the old Active map.
    const recipients = occupantIds
      .filter(occupantId => occupantId !== actor)
      .map(occupantId => {
        const principal = principalControlling(control, occupantId)
        return principal === undefined ? undefined : context.sessions?.activeFor(principal)
      })
      .filter((recipient): recipient is Session => recipient !== undefined)
    for (const recipient of recipients) {
      recipient.send(`${speaker} says, "${line}"`)
    }
  })
  return { runtime, world, sessions, control }
}

describe("session lifecycle probe", () => {
  it("goes from open through active, receiving output, to disconnect and inactive -- while the principal and entity survive and the SessionId does not", async () => {
    const { runtime, world, sessions, control } = setupLook()
    world.add(entity(entityId("player-1"), "test.player"))
    control.set(principalId("alice"), entityId("player-1"))

    // open -> SessionId assigned -> associate PrincipalId (baked into construction, the same as
    // every earlier probe's fake session; Sessions never assigns or authenticates one itself).
    const alice = testSession("session-1", "alice")
    sessions.open(alice)

    // active
    expect(sessions.has(alice.id)).toBe(true)
    expect(sessions.activeFor(principalId("alice"))).toBe(alice)

    // receive output, driven through the controlled entity -- proving "active" is not just a flag
    // but actually reachable through a real handler.
    runtime.submit({ work: lookWork(alice, control) })
    await runtime.drain()
    expect(alice.output).toEqual(["you are player-1, a test.player"])

    // disconnect -> inactive
    expect(sessions.disconnect(alice.id)).toBe(true)
    expect(sessions.has(alice.id)).toBe(false)
    expect(sessions.get(alice.id)).toBeUndefined()
    expect(sessions.activeFor(principalId("alice"))).toBeUndefined()

    // Principal survives: Control was never touched by the disconnect.
    expect(control.get(principalId("alice"))).toBe(entityId("player-1"))
    // Entity survives: WorldState was never touched by the disconnect.
    expect(world.has(entityId("player-1"))).toBe(true)
    expect(world.get(entityId("player-1"))?.type).toBe("test.player")

    // SessionId does not survive: it never resolves to anything again on its own.
    expect(sessions.get(alice.id)).toBeUndefined()
  })

  it("resumes control of the same entity after a reconnect, under a brand-new SessionId", async () => {
    const { runtime, world, sessions, control } = setupLook()
    world.add(entity(entityId("player-1"), "test.player"))
    control.set(principalId("alice"), entityId("player-1"))

    const firstConnection = testSession("session-1", "alice")
    sessions.open(firstConnection)
    runtime.submit({ work: lookWork(firstConnection, control) })
    await runtime.drain()

    // Disconnect. The principal keeps controlling player-1; only the SessionId stops resolving.
    sessions.disconnect(firstConnection.id)

    const reconnected = testSession("session-2", "alice")
    sessions.open(reconnected)
    runtime.submit({ work: lookWork(reconnected, control) })
    await runtime.drain()

    expect(firstConnection.id).not.toBe(reconnected.id)
    expect(sessions.has(firstConnection.id)).toBe(false)
    expect(sessions.has(reconnected.id)).toBe(true)
    expect(firstConnection.output).toEqual(["you are player-1, a test.player"])
    expect(reconnected.output).toEqual(["you are player-1, a test.player"])
  })

  it("still lets an NPC-driven action run with no Session, and so no Sessions registration, at all", async () => {
    const { runtime, world } = setupLook()
    world.add(entity(entityId("goblin-1"), "test.npc"))

    runtime.submit({ work: work(look, { session: undefined, actor: entityId("goblin-1") }) })

    await expect(runtime.drain()).resolves.toBe(1)
  })

  it("fans a say out to every other active occupant through Sessions and Control, and a disconnect stops only that one occupant from hearing what's said next", async () => {
    const { runtime, world, sessions, control } = setupSay()
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
    control.set(principalId("alice"), alicePlayer)
    control.set(principalId("bob"), bobPlayer)
    control.set(principalId("carol"), carolPlayer)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    const carol = testSession("session-3", "carol")
    sessions.open(alice)
    sessions.open(bob)
    sessions.open(carol)

    runtime.submit({ work: sayWork(alice, control, "hello") })
    await runtime.drain()

    expect(alice.output).toEqual(['You say, "hello"'])
    expect(bob.output).toEqual(['alice says, "hello"'])
    expect(carol.output).toEqual(['alice says, "hello"'])

    // Bob disconnects. His control and entity are untouched -- only his SessionId stops resolving.
    sessions.disconnect(bob.id)

    runtime.submit({ work: sayWork(carol, control, "still there?") })
    await runtime.drain()

    expect(control.get(principalId("bob"))).toBe(bobPlayer)
    expect(world.has(bobPlayer)).toBe(true)
    // Nothing new reached Bob: he is no longer resolvable as an active recipient.
    expect(bob.output).toEqual(['alice says, "hello"'])
    // Alice, still active, hears it.
    expect(alice.output).toEqual(['You say, "hello"', 'carol says, "still there?"'])
  })
})
