import { Runtime } from "@stratamu/engine-core"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import type { PrincipalId, SessionId } from "@stratamu/primitives"
import { entityId, principalId } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"
import { describe, expect, expectTypeOf, it } from "vitest"

import { TestAdapter } from "../test-adapter.ts"
import { testSession } from "../test-session.ts"
import { look } from "../work-kinds.ts"

/**
 * The proof docs/SESSION_BOUNDARY.md section 15 calls for: the smallest contracts needed for
 * session input, adapter-owned Work construction, and semantic output, without building
 * networking or a complete Session subsystem.
 *
 *   raw input -> Session -> adapter parser -> Work -> Runtime -> handler -> semantic output -> Session
 *
 * What the proof actually settles: none of `engine/core` needed to change. `TaskContext` gained
 * nothing new. Addressing output turned out not to need a core concept at all -- the adapter
 * already owns `Work.input`, so it can carry a session reference there, the same way it owns
 * everything else about what a `Work` means.
 *
 * Originally `engine/core/src/runtime/session-boundary.test.ts`, with a local `Session` and a
 * throwaway `look` that looked a fixed room up by id, unconnected to control -- `Session`'s shape
 * was exactly the open question this proof existed to inform, so it stood in for *some* Work,
 * not a real one. Relocated here, and rebased onto the adapter's real, reflexive `look` (an
 * actor describing itself, resolved through `control` -- see `player-control.test.ts`), once the
 * adapter existed to supply one. See `world-movement.test.ts`'s docblock for why relocated.
 *
 * The original file also had a test proving one `Work` could address several sessions -- an
 * invented `{ speaker, hearers, line }` shape, "the way a 'say' would". The real `say` now proves
 * exactly that, more realistically (through occupancy, `Control` and `Sessions`, not an explicit
 * hearer list): see `world-messaging.test.ts` and `session-lifecycle.test.ts`. Not repeated here.
 */

function setup() {
  const world = new WorldState()
  const adapter = new TestAdapter()
  const runtime = new Runtime({ engineState: { world } })
  adapter.registerHandlers(runtime)
  world.add(entity(entityId("player-1"), "test.player"))
  adapter.control.set(principalId("alice"), entityId("player-1"))
  return { runtime, world, adapter }
}

describe("session boundary proof: input reaches the engine and semantic output reaches the session", () => {
  it("routes recognized input through Session -> parser -> Work -> Runtime -> handler -> Session", async () => {
    const { runtime, adapter } = setup()
    const session = testSession("session-1", "alice")

    const parsed = adapter.parse({ session, raw: "look" })
    expect(parsed).toHaveLength(1)
    for (const item of parsed) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual(["you are player-1, a test.player"])
  })

  it("produces no Work, and so no output, for input the adapter does not recognize", async () => {
    const { runtime, adapter } = setup()
    const session = testSession("session-1", "alice")

    const parsed = adapter.parse({ session, raw: "xyzzy" })

    expect(parsed).toEqual([])
    expect(runtime.pending).toBe(0)
    expect(session.output).toEqual([])
  })

  it("lets a session see the effect of a mutation from an earlier, unrelated Work", async () => {
    const { runtime, world, adapter } = setup()
    const session = testSession("session-1", "alice")
    // A generic ordering proof, not a game operation the adapter owns -- proves two submitted
    // Work items execute in submission order, sharing the same WorldState, not anything about
    // look/move/say specifically. Registered directly, the same way runtime.test.ts's own
    // infrastructure-level tests register a throwaway WorkKind.
    const create = workKind("test.create")
    runtime.handle(create, (_task, context) => {
      context.world?.add(entity(entityId("room-2"), "test.room"))
    })

    runtime.submit({ work: work(create, undefined) })
    for (const item of adapter.parse({ session, raw: "look" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(world.has(entityId("room-2"))).toBe(true)
    expect(session.output).toEqual(["you are player-1, a test.player"])
  })

  it("works with no session at all, for work with no participant behind it", async () => {
    const { runtime } = setup()

    runtime.submit({ work: work(look, { session: undefined, actor: entityId("player-1") }) })

    await expect(runtime.drain()).resolves.toBe(1)
  })

  it("keeps a reconnect's new SessionId separate from the unchanged PrincipalId", () => {
    const firstConnection = testSession("session-1", "alice")
    const reconnected = testSession("session-2", "alice")

    expect(firstConnection.id).not.toBe(reconnected.id)
    expect(firstConnection.principalId).toBe(reconnected.principalId)
  })

  it("narrows Session's ids to their own branded types, not interchangeable strings", () => {
    const session = testSession("session-1", "alice")

    expectTypeOf(session.id).toEqualTypeOf<SessionId>()
    expectTypeOf(session.principalId).toEqualTypeOf<PrincipalId | undefined>()
  })
})
