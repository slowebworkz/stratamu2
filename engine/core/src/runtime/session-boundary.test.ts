import type { EngineState } from "@stratamu/engine-world"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import type { PrincipalId, SessionId } from "@stratamu/primitives"
import { entityId, principalId, sessionId } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"
import { describe, expect, expectTypeOf, it } from "vitest"

import { Runtime } from "./runtime.ts"

/**
 * The proof docs/SESSION_BOUNDARY.md section 15 calls for: the smallest contracts needed for
 * session input, adapter-owned Work construction, and semantic output, without building
 * networking or a complete Session subsystem.
 *
 *   raw input -> Session -> adapter parser -> Work -> Runtime -> handler -> semantic output -> Session
 *
 * `Session` here is deliberately minimal and local to this test, not a package: its shape is
 * exactly one of the open questions the proof exists to inform, so building it as a real package
 * first would presume the answer. What the proof actually settles: none of engine/core needed to
 * change. `TaskContext` gained nothing new. Addressing output turned out not to need a core
 * concept at all -- the adapter already owns `Work.input`, so it can carry a session reference
 * there, the same way it owns everything else about what a `Work` means.
 */

/** Minimal enough to prove the boundary, not a Session subsystem: an id, an optional principal
 * association, and somewhere to send semantic output. Real transport is not this proof's concern. */
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

/**
 * The adapter's parser: raw input -> Work. `Session` never sees this logic, and `Runtime` never
 * sees the raw input at all -- only the `Work` this produces. Returns undefined for input the
 * adapter does not recognize, so no `Work` is ever constructed for it: Session transports:
 * whether something was understood is the adapter's call, not something core needs to know.
 */
const look = workKind("test.look")

function parse(session: Session, raw: string) {
  if (raw === "look") {
    return work(look, { session, target: entityId("room-1") })
  }
  return undefined
}

function setup() {
  const world = new WorldState()
  world.add(entity(entityId("room-1"), "test.room"))
  const engineState: EngineState = { world }
  const runtime = new Runtime({ engineState })
  runtime.handle(look, (task, context) => {
    const { session, target } = task.work.input as {
      session: Session | undefined
      target: ReturnType<typeof entityId>
    }
    const room = context.world?.get(target)
    // No session behind this Work (an NPC's own action, say) means nowhere to send output, not
    // an error: Session is how a participant hears about the world, not a requirement to act in it.
    session?.send(room === undefined ? "you see nothing" : `${room.id} exists`)
  })
  return { runtime, world }
}

describe("session boundary proof: input reaches the engine and semantic output reaches the session", () => {
  it("routes recognized input through Session -> parser -> Work -> Runtime -> handler -> Session", async () => {
    const { runtime } = setup()
    const session = testSession("session-1", "alice")

    const parsed = parse(session, "look")
    expect(parsed).toBeDefined()
    runtime.submit({ work: parsed as NonNullable<typeof parsed> })
    await runtime.drain()

    expect(session.output).toEqual(["room-1 exists"])
  })

  it("produces no Work, and so no output, for input the adapter does not recognize", async () => {
    const { runtime } = setup()
    const session = testSession("session-1", "alice")

    const parsed = parse(session, "xyzzy")

    expect(parsed).toBeUndefined()
    expect(runtime.pending).toBe(0)
    expect(session.output).toEqual([])
  })

  it("lets a session see the effect of a mutation from an earlier, unrelated Work", async () => {
    const { runtime, world } = setup()
    const session = testSession("session-1", "alice")
    const create = workKind("test.create")
    runtime.handle(create, (_task, context) => {
      context.world?.add(entity(entityId("room-2"), "test.room"))
    })

    runtime.submit({ work: work(create, undefined) })
    runtime.submit({ work: parse(session, "look") as NonNullable<ReturnType<typeof parse>> })
    await runtime.drain()

    expect(world.has(entityId("room-2"))).toBe(true)
    expect(session.output).toEqual(["room-1 exists"])
  })

  it("works with no session at all, for work with no participant behind it", async () => {
    const { runtime } = setup()

    runtime.submit({ work: work(look, { session: undefined, target: entityId("room-1") }) })

    await expect(runtime.drain()).resolves.toBe(1)
  })

  it("lets one Work address more than one session, the way a 'say' would", async () => {
    const world = new WorldState()
    const runtime = new Runtime({ engineState: { world } })
    const say = workKind("test.say")
    runtime.handle(say, task => {
      const { speaker, hearers, line } = task.work.input as {
        speaker: Session
        hearers: readonly Session[]
        line: string
      }
      speaker.send(`You say, "${line}"`)
      for (const hearer of hearers) {
        hearer.send(`Someone says, "${line}"`)
      }
    })
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    const carol = testSession("session-3", "carol")

    runtime.submit({ work: work(say, { speaker: alice, hearers: [bob, carol], line: "hello" }) })
    await runtime.drain()

    expect(alice.output).toEqual(['You say, "hello"'])
    expect(bob.output).toEqual(['Someone says, "hello"'])
    expect(carol.output).toEqual(['Someone says, "hello"'])
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
