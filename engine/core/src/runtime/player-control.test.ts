import type { EngineState } from "@stratamu/engine-world"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import type { EntityId, PrincipalId, SessionId } from "@stratamu/primitives"
import { entityId, principalId, sessionId } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { Runtime } from "./runtime.ts"

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
 * As with the session-boundary proof, `Session` and the `Control` mapping stay local to this
 * test, not a package: neither's real shape is settled, and this is the same kind of proof that
 * settled `TaskContext.world` and session output -- discover the contract, don't build the
 * subsystem around a guess.
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

/**
 * Who currently controls which entity, keyed by `PrincipalId`, not `SessionId`: a reconnect gets
 * a new session but must not lose control of the same entity, since the principal -- the thing
 * this is keyed on -- is exactly what survives a reconnect.
 */
type Control = Map<PrincipalId, EntityId>

const look = workKind("test.look")

/** The adapter's parser, as in the session-boundary proof: raw input -> Work, or undefined for
 * anything it doesn't recognize. Resolves the session's actor here, once, from `control`. */
function parse(session: Session, control: Control, raw: string) {
  if (raw !== "look") {
    return undefined
  }
  const actor = session.principalId === undefined ? undefined : control.get(session.principalId)
  return work(look, { session, actor })
}

function setup() {
  const world = new WorldState()
  const engineState: EngineState = { world }
  const runtime = new Runtime({ engineState })
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
  return { runtime, world }
}

describe("player control proof: a principal's controlled entity drives a real handler", () => {
  it("routes PrincipalId -> controlled EntityId -> Session -> Work -> Runtime -> handler -> WorldState -> Session output", async () => {
    const { runtime, world } = setup()
    world.add(entity(entityId("player-1"), "test.player"))
    const control: Control = new Map([[principalId("alice"), entityId("player-1")]])
    const session = testSession("session-1", "alice")

    const parsed = parse(session, control, "look")
    expect(parsed).toBeDefined()
    runtime.submit({ work: parsed as NonNullable<typeof parsed> })
    await runtime.drain()

    expect(session.output).toEqual(["you are player-1, a test.player"])
  })

  it("keeps two principals' control separate: each session only ever sees its own entity", async () => {
    const { runtime, world } = setup()
    world.add(entity(entityId("player-1"), "test.player"))
    world.add(entity(entityId("player-2"), "test.player"))
    const control: Control = new Map([
      [principalId("alice"), entityId("player-1")],
      [principalId("bob"), entityId("player-2")],
    ])
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")

    runtime.submit({ work: parse(alice, control, "look") as NonNullable<ReturnType<typeof parse>> })
    runtime.submit({ work: parse(bob, control, "look") as NonNullable<ReturnType<typeof parse>> })
    await runtime.drain()

    expect(alice.output).toEqual(["you are player-1, a test.player"])
    expect(bob.output).toEqual(["you are player-2, a test.player"])
  })

  it("keeps controlling the same entity across a reconnect: same PrincipalId, new SessionId", async () => {
    const { runtime, world } = setup()
    world.add(entity(entityId("player-1"), "test.player"))
    const control: Control = new Map([[principalId("alice"), entityId("player-1")]])
    const firstConnection = testSession("session-1", "alice")
    runtime.submit({
      work: parse(firstConnection, control, "look") as NonNullable<ReturnType<typeof parse>>,
    })
    await runtime.drain()

    // Disconnect. A new connection gets a new SessionId; the principal, and so the control
    // mapping keyed on it, is untouched by that.
    const reconnected = testSession("session-2", "alice")
    runtime.submit({
      work: parse(reconnected, control, "look") as NonNullable<ReturnType<typeof parse>>,
    })
    await runtime.drain()

    expect(firstConnection.id).not.toBe(reconnected.id)
    expect(firstConnection.output).toEqual(["you are player-1, a test.player"])
    expect(reconnected.output).toEqual(["you are player-1, a test.player"])
  })

  it("degrades gracefully for a session with no PrincipalId, or a principal controlling nothing yet", async () => {
    const { runtime } = setup()
    const control: Control = new Map()
    const anonymous = testSession("session-1")
    const uncontrolled = testSession("session-2", "carol")

    runtime.submit({
      work: parse(anonymous, control, "look") as NonNullable<ReturnType<typeof parse>>,
    })
    runtime.submit({
      work: parse(uncontrolled, control, "look") as NonNullable<ReturnType<typeof parse>>,
    })
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
