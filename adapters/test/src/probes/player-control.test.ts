import { Runtime } from "@stratamu/engine-core"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import { entityId, principalId } from "@stratamu/primitives"
import { work } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { TestAdapter } from "../test-adapter.ts"
import { testSession } from "../test-session.ts"
import { look } from "../work-kinds.ts"

/**
 * The first slice driven by game semantics rather than infrastructure: a principal's controlled
 * entity, reached through a session, drives a real handler against `WorldState`.
 *
 *   PrincipalId -> controlled EntityId -> Session -> Work -> Runtime -> handler -> WorldState -> Session output
 *
 * `look` here is deliberately reflexive -- it describes the actor's own entity, not a room. A
 * location concept would be a second, separate thing to prove; this slice proves the first thing,
 * that control resolves correctly, without inventing one to make `look` feel more familiar.
 *
 * Originally `engine/core/src/runtime/player-control.test.ts`, with a local `Session`/`Control`/
 * `look` handler exactly like this adapter's own. Relocated here once the adapter existed to
 * actually own that implementation -- see `world-movement.test.ts`'s docblock for why.
 */

function setup() {
  const world = new WorldState()
  const adapter = new TestAdapter()
  const runtime = new Runtime({ engineState: { world } })
  adapter.registerHandlers(runtime)
  return { runtime, world, adapter }
}

describe("player control proof: a principal's controlled entity drives a real handler", () => {
  it("routes PrincipalId -> controlled EntityId -> Session -> Work -> Runtime -> handler -> WorldState -> Session output", async () => {
    const { runtime, world, adapter } = setup()
    world.add(entity(entityId("player-1"), "test.player"))
    adapter.control.set(principalId("alice"), entityId("player-1"))
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual(["you are player-1, a test.player"])
  })

  it("keeps two principals' control separate: each session only ever sees its own entity", async () => {
    const { runtime, world, adapter } = setup()
    world.add(entity(entityId("player-1"), "test.player"))
    world.add(entity(entityId("player-2"), "test.player"))
    adapter.control.set(principalId("alice"), entityId("player-1"))
    adapter.control.set(principalId("bob"), entityId("player-2"))
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")

    for (const item of adapter.parse({ session: alice, raw: "look" })) {
      runtime.submit({ work: item })
    }
    for (const item of adapter.parse({ session: bob, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual(["you are player-1, a test.player"])
    expect(bob.output).toEqual(["you are player-2, a test.player"])
  })

  it("keeps controlling the same entity across a reconnect: same PrincipalId, new SessionId", async () => {
    const { runtime, world, adapter } = setup()
    world.add(entity(entityId("player-1"), "test.player"))
    adapter.control.set(principalId("alice"), entityId("player-1"))
    const firstConnection = testSession("session-1", "alice")
    for (const item of adapter.parse({ session: firstConnection, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    // Disconnect. A new connection gets a new SessionId; the principal, and so the control
    // mapping keyed on it, is untouched by that.
    const reconnected = testSession("session-2", "alice")
    for (const item of adapter.parse({ session: reconnected, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(firstConnection.id).not.toBe(reconnected.id)
    expect(firstConnection.output).toEqual(["you are player-1, a test.player"])
    expect(reconnected.output).toEqual(["you are player-1, a test.player"])
  })

  it("degrades gracefully for a session with no PrincipalId, or a principal controlling nothing yet", async () => {
    const { runtime, adapter } = setup()
    const anonymous = testSession("session-1")
    const uncontrolled = testSession("session-2", "carol")

    for (const item of adapter.parse({ session: anonymous, raw: "look" })) {
      runtime.submit({ work: item })
    }
    for (const item of adapter.parse({ session: uncontrolled, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(anonymous.output).toEqual(["you are not controlling anything"])
    expect(uncontrolled.output).toEqual(["you are not controlling anything"])
  })

  it("still lets an NPC-driven action run with no session or principal at all", async () => {
    const { runtime, world } = setup()
    world.add(entity(entityId("goblin-1"), "test.npc"))

    runtime.submit({ work: work(look, { session: undefined, actor: entityId("goblin-1") }) })

    await expect(runtime.drain()).resolves.toBe(1)
  })
})
