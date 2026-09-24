import { Engine } from "@stratamu/engine-core"
import { entity } from "@stratamu/entity"
import { entityId, principalId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import { TestAdapter } from "./test-adapter.ts"
import { testSession } from "./test-session.ts"

/**
 * The architectural seam that was still missing after the adapter contract: every probe so far,
 * including this adapter's own `test-adapter.test.ts`, assembled a `Runtime` and its
 * engine-owned state (`WorldState`, `Sessions`) by hand, in its own `setup()`:
 *
 *   const world = new WorldState()
 *   const sessions = new Sessions()
 *   const runtime = new Runtime({ engineState: { world, sessions } })
 *   adapter.registerHandlers(runtime)
 *
 * `@stratamu/engine-core`'s `Engine` is exactly that composition, made real and reusable --
 * proven here against a real adapter's real handlers, not a stub. The question this file answers
 * is not "does `look`/`move`/`say` still work" (settled already); it is "does composing through
 * `Engine` change anything about that". It does not:
 *
 *   transport/session -> Engine -> Adapter -> Work -> Runtime -> handlers -> WorldState/Sessions
 *
 * `Engine` never calls `adapter.parse` and never sees a raw input string -- composing the pieces
 * so a handler can run is its whole job. Routing input through the adapter to get `Work`, then
 * submitting it, stays the caller's concern here, the same as it always has: `Engine` does not
 * own that step, only `runtime`/`world`/`sessions` and calling `registerHandlers` once.
 */

function setup() {
  const adapter = new TestAdapter()
  const engine = new Engine(adapter)
  return { engine, adapter }
}

describe("engine composition proof", () => {
  it('"look" -> adapter -> test.look -> Runtime -> output', async () => {
    const { engine, adapter } = setup()
    engine.world.add(entity(entityId("player-1"), "test.player"))
    adapter.control.set(principalId("alice"), entityId("player-1"))
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "look" })) {
      engine.runtime.submit({ work: item })
    }
    await engine.runtime.drain()

    expect(session.output).toEqual(["you are player-1, a test.player"])
  })

  it('"move north" -> adapter -> test.move -> Runtime -> WorldState mutation', async () => {
    const { engine, adapter } = setup()
    const roomA = entityId("room-a")
    const roomB = entityId("room-b")
    engine.world.add(entity(roomA, "test.room"))
    engine.world.add(entity(roomB, "test.room"))
    engine.world.add(entity(entityId("player-1"), "test.player"))
    engine.world.locate(entityId("player-1"), roomA)
    adapter.exits.set(roomA, new Map([["north", roomB]]))
    adapter.control.set(principalId("alice"), entityId("player-1"))
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "move north" })) {
      engine.runtime.submit({ work: item })
    }
    await engine.runtime.drain()

    expect(engine.world.locationOf(entityId("player-1"))).toBe(roomB)
    expect(session.output).toEqual(["you go north"])
  })

  it('"say hello" -> adapter -> test.say -> Runtime -> recipient output', async () => {
    const { engine, adapter } = setup()
    const room = entityId("room-1")
    engine.world.add(entity(room, "test.room"))
    const alicePlayer = entityId("alice-player")
    const bobPlayer = entityId("bob-player")
    engine.world.add(entity(alicePlayer, "test.player"))
    engine.world.add(entity(bobPlayer, "test.player"))
    engine.world.locate(alicePlayer, room)
    engine.world.locate(bobPlayer, room)
    adapter.control.set(principalId("alice"), alicePlayer)
    adapter.control.set(principalId("bob"), bobPlayer)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    engine.sessions.open(alice)
    engine.sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "say hello" })) {
      engine.runtime.submit({ work: item })
    }
    await engine.runtime.drain()

    expect(alice.output).toEqual(['You say, "hello"'])
    expect(bob.output).toEqual(['alice says, "hello"'])
  })
})
