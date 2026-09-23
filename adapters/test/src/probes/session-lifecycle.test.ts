import { Runtime } from "@stratamu/engine-core"
import { Sessions } from "@stratamu/engine-sessions"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import { entityId, principalId } from "@stratamu/primitives"
import { work } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { TestAdapter } from "../test-adapter.ts"
import { testSession } from "../test-session.ts"
import { look } from "../work-kinds.ts"

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
 * was here -- an adapter-owned `Map`, not promoted into `@stratamu/engine-sessions` alongside
 * `Sessions` -- because ownership is a game-rule concern, not a session-lifecycle one. A
 * disconnect only ever calls `sessions.disconnect(id)`: never touches `Control`, never touches
 * `WorldState`.
 *
 * Originally `engine/core/src/runtime/session-lifecycle.test.ts`, with a local `Session`/
 * `Control`/`look`/`say` handler exactly like this adapter's own. Relocated here once the adapter
 * existed to actually own that implementation -- see `world-movement.test.ts`'s docblock for why.
 */

function setup() {
  const world = new WorldState()
  const sessions = new Sessions()
  const adapter = new TestAdapter()
  const runtime = new Runtime({ engineState: { world, sessions } })
  adapter.registerHandlers(runtime)
  return { runtime, world, sessions, adapter }
}

describe("session lifecycle probe", () => {
  it("goes from open through active, receiving output, to disconnect and inactive -- while the principal and entity survive and the SessionId does not", async () => {
    const { runtime, world, sessions, adapter } = setup()
    world.add(entity(entityId("player-1"), "test.player"))
    adapter.control.set(principalId("alice"), entityId("player-1"))

    // open -> SessionId assigned -> associate PrincipalId (baked into construction, the same as
    // every earlier probe's fake session; Sessions never assigns or authenticates one itself).
    const alice = testSession("session-1", "alice")
    sessions.open(alice)

    // active
    expect(sessions.has(alice.id)).toBe(true)
    expect(sessions.activeFor(principalId("alice"))).toBe(alice)

    // receive output, driven through the controlled entity -- proving "active" is not just a flag
    // but actually reachable through a real handler.
    for (const item of adapter.parse({ session: alice, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()
    expect(alice.output).toEqual(["you are player-1, a test.player"])

    // disconnect -> inactive
    expect(sessions.disconnect(alice.id)).toBe(true)
    expect(sessions.has(alice.id)).toBe(false)
    expect(sessions.get(alice.id)).toBeUndefined()
    expect(sessions.activeFor(principalId("alice"))).toBeUndefined()

    // Principal survives: Control was never touched by the disconnect.
    expect(adapter.control.get(principalId("alice"))).toBe(entityId("player-1"))
    // Entity survives: WorldState was never touched by the disconnect.
    expect(world.has(entityId("player-1"))).toBe(true)
    expect(world.get(entityId("player-1"))?.type).toBe("test.player")

    // SessionId does not survive: it never resolves to anything again on its own.
    expect(sessions.get(alice.id)).toBeUndefined()
  })

  it("resumes control of the same entity after a reconnect, under a brand-new SessionId", async () => {
    const { runtime, world, sessions, adapter } = setup()
    world.add(entity(entityId("player-1"), "test.player"))
    adapter.control.set(principalId("alice"), entityId("player-1"))

    const firstConnection = testSession("session-1", "alice")
    sessions.open(firstConnection)
    for (const item of adapter.parse({ session: firstConnection, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    // Disconnect. The principal keeps controlling player-1; only the SessionId stops resolving.
    sessions.disconnect(firstConnection.id)

    const reconnected = testSession("session-2", "alice")
    sessions.open(reconnected)
    for (const item of adapter.parse({ session: reconnected, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(firstConnection.id).not.toBe(reconnected.id)
    expect(sessions.has(firstConnection.id)).toBe(false)
    expect(sessions.has(reconnected.id)).toBe(true)
    expect(firstConnection.output).toEqual(["you are player-1, a test.player"])
    expect(reconnected.output).toEqual(["you are player-1, a test.player"])
  })

  it("still lets an NPC-driven action run with no Session, and so no Sessions registration, at all", async () => {
    const { runtime, world } = setup()
    world.add(entity(entityId("goblin-1"), "test.npc"))

    runtime.submit({ work: work(look, { session: undefined, actor: entityId("goblin-1") }) })

    await expect(runtime.drain()).resolves.toBe(1)
  })

  it("fans a say out to every other active occupant through Sessions and Control, and a disconnect stops only that one occupant from hearing what's said next", async () => {
    const { runtime, world, sessions, adapter } = setup()
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
    adapter.control.set(principalId("alice"), alicePlayer)
    adapter.control.set(principalId("bob"), bobPlayer)
    adapter.control.set(principalId("carol"), carolPlayer)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    const carol = testSession("session-3", "carol")
    sessions.open(alice)
    sessions.open(bob)
    sessions.open(carol)

    for (const item of adapter.parse({ session: alice, raw: "say hello" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual(['You say, "hello"'])
    expect(bob.output).toEqual(['alice says, "hello"'])
    expect(carol.output).toEqual(['alice says, "hello"'])

    // Bob disconnects. His control and entity are untouched -- only his SessionId stops resolving.
    sessions.disconnect(bob.id)

    for (const item of adapter.parse({ session: carol, raw: "say still there?" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(adapter.control.get(principalId("bob"))).toBe(bobPlayer)
    expect(world.has(bobPlayer)).toBe(true)
    // Nothing new reached Bob: he is no longer resolvable as an active recipient.
    expect(bob.output).toEqual(['alice says, "hello"'])
    // Alice, still active, hears it.
    expect(alice.output).toEqual(['You say, "hello"', 'carol says, "still there?"'])
  })
})
