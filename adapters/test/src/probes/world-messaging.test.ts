import { Runtime } from "@stratamu/engine-core"
import { Sessions } from "@stratamu/engine-sessions"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import { entityId, principalId } from "@stratamu/primitives"
import { work } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { TestAdapter } from "../test-adapter.ts"
import { testSession } from "../test-session.ts"
import { say } from "../work-kinds.ts"

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
 * disconnect). A principal can own an entity while offline, so who is actually reachable right
 * now needs tracking separately -- see `@stratamu/engine-sessions`'s `Sessions`.
 *
 * What this does *not* reveal a need for: any kind of `MessageBus`/`EventBus`/`Broadcaster`. The
 * handler is exactly `for (const recipient of recipients) { recipient.send(...) }` -- a plain
 * array, built from `WorldState.occupants`, `Control` and `Sessions`, iterated directly.
 *
 * Originally `engine/core/src/runtime/world-messaging.test.ts`, with a local `Session`/`Control`/
 * `say` handler exactly like this adapter's own, and a bespoke test-local `Active` map
 * (`EntityId -> Session`) standing in for what `@stratamu/engine-sessions`'s `Sessions` is today
 * (that probe predates `Sessions`; see `session-lifecycle.test.ts`, which introduced it).
 * Relocated here, and rebased onto the real `Sessions`, once the adapter existed to actually own
 * this implementation -- see `world-movement.test.ts`'s docblock for why.
 */

function setup() {
  const world = new WorldState()
  const sessions = new Sessions()
  const adapter = new TestAdapter()
  const runtime = new Runtime({ engineState: { world, sessions } })
  adapter.registerHandlers(runtime)
  return { runtime, world, sessions, adapter }
}

describe("world messaging probe", () => {
  it("says hello: the speaker, and every other occupant of the same location, hear the expected message", async () => {
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
  })

  it("does not deliver to an occupant of a different location", async () => {
    const { runtime, world, sessions, adapter } = setup()
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
    adapter.control.set(principalId("alice"), alicePlayer)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "say hello" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(bob.output).toEqual([])
  })

  it("does not deliver to an owner who is not currently connected", async () => {
    const { runtime, world, adapter } = setup()
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
    // Bob owns bobPlayer but has no active session: never opened.

    // No assertion needs bob's output directly -- there is no session object to assert on. The
    // proof is that the task completes rather than failing: drain() resolving to 1 only means one
    // step happened, not that it succeeded, so the outcome itself has to be checked.
    const [item] = adapter.parse({ session: alice, raw: "say hello" })
    const handle = runtime.submit({ work: item as NonNullable<typeof item> })
    await runtime.drain()

    expect(await handle.settled).toEqual({ state: "completed" })
    expect(alice.output).toEqual(['You say, "hello"'])
  })

  it("lets an NPC/script say something with no Session or Principal at all", async () => {
    const { runtime, world, sessions, adapter } = setup()
    const room = entityId("room-1")
    world.add(entity(room, "test.room"))
    const goblin = entityId("goblin-1")
    const bystanderPlayer = entityId("bystander-player")
    world.add(entity(goblin, "test.npc"))
    world.add(entity(bystanderPlayer, "test.player"))
    world.locate(goblin, room)
    world.locate(bystanderPlayer, room)
    adapter.control.set(principalId("bystander"), bystanderPlayer)
    const bystander = testSession("session-1", "bystander")
    sessions.open(bystander)

    runtime.submit({ work: work(say, { session: undefined, actor: goblin, line: "grr" }) })
    await runtime.drain()

    expect(bystander.output).toEqual(['goblin-1 says, "grr"'])
  })
})
