import { Engine } from "@stratamu/engine-core"
import { entity } from "@stratamu/entity"
import { entityId, principalId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import { TestAdapter } from "./test-adapter.ts"
import { testSession } from "./test-session.ts"

/**
 * The architectural seam that was still missing after the adapter contract: every probe,
 * including this adapter's own `test-adapter.test.ts`, assembled a `Runtime` and its
 * engine-owned state (`WorldState`, `Sessions`) by hand, in its own `setup()`, then routed input
 * through the adapter itself, one step at a time:
 *
 *   const world = new WorldState()
 *   const sessions = new Sessions()
 *   const runtime = new Runtime({ engineState: { world, sessions } })
 *   adapter.registerHandlers(runtime)
 *   for (const item of adapter.parse(input)) { runtime.submit({ work: item }) }
 *
 * `@stratamu/engine-core`'s `Engine` is exactly that composition, made real and reusable --
 * proven here against a real adapter's real handlers, not a stub:
 *
 *   create Engine(TestAdapter)
 *     -> session receives "look"
 *     -> engine.receive(input)
 *     -> adapter.parse(...)
 *     -> Work
 *     -> Runtime
 *     -> look handler
 *     -> WorldState
 *     -> session output
 *
 * A configured game can now actually run on the engine -- through one constructor and one
 * `receive` call -- rather than only ever being invoked manually inside a test's own `setup()`.
 * The three cases below (`look`, `move`, `say`) are not new findings; the point is that composing
 * them through `Engine` changes nothing about how they behave. `Engine` still never owns the
 * adapter's grammar -- `receive` calls straight into `adapter.parse`, whatever that adapter's own
 * `Input` type turns out to be (`SessionInput` here, inferred, never named by `Engine` itself) --
 * and `Runtime` still never learns any of it.
 */

function setup() {
  const adapter = new TestAdapter()
  const engine = new Engine(adapter)
  return { engine, adapter }
}

describe("engine composition proof", () => {
  it('"look" -> Engine.receive -> adapter -> test.look -> Runtime -> output', async () => {
    const { engine, adapter } = setup()
    engine.world.add(entity(entityId("player-1"), "test.player"))
    adapter.control.set(principalId("alice"), entityId("player-1"))
    const session = testSession("session-1", "alice")

    engine.receive({ session, raw: "look" })
    await engine.runtime.drain()

    expect(session.output).toEqual(["you are player-1, a test.player"])
  })

  it('"move north" -> Engine.receive -> adapter -> test.move -> Runtime -> WorldState mutation', async () => {
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

    engine.receive({ session, raw: "move north" })
    await engine.runtime.drain()

    expect(engine.world.locationOf(entityId("player-1"))).toBe(roomB)
    expect(session.output).toEqual(["you go north"])
  })

  it('"say hello" -> Engine.receive -> adapter -> test.say -> Runtime -> recipient output', async () => {
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

    engine.receive({ session: alice, raw: "say hello" })
    await engine.runtime.drain()

    expect(alice.output).toEqual(['You say, "hello"'])
    expect(bob.output).toEqual(['alice says, "hello"'])
  })

  it("routes input the adapter's grammar does not recognize to nothing, through the same entry point", () => {
    const { engine } = setup()
    const session = testSession("session-1", "alice")

    engine.receive({ session, raw: "xyzzy" })

    expect(engine.runtime.pending).toBe(0)
    expect(session.output).toEqual([])
  })
})
