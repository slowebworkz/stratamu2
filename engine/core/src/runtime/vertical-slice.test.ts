import type { EngineState } from "@stratamu/engine-world"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import { entityId } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { Runtime } from "./runtime.ts"

/**
 * The smallest end-to-end path through the architecture, proving the pieces built so far
 * actually connect:
 *
 *   Input -> Work -> Task -> Runtime -> TaskHandler -> EngineState -> WorldState -> Output
 *
 * The domain is deliberately trivial (one room, one command) because the point is not the game,
 * it is the wiring: a task handler, reached through nothing but `Runtime.submit` and
 * `TaskContext.world`, can read the authoritative state a completely different part of the
 * system constructed, and its answer comes back out through the task's ordinary outcome. No
 * session, adapter or transport exists yet, and none is needed to prove this.
 */
describe("vertical slice: input reaches authoritative state and comes back as output", () => {
  it("answers 'look' by reading the room from WorldState", async () => {
    // The authoritative state, built by whatever composes the engine (a future App layer, or
    // here, the test itself) - not by the runtime, and not by the handler.
    const world = new WorldState()
    world.add(entity(entityId("room-1"), "test.room"))
    const engineState: EngineState = { world }
    const runtime = new Runtime({ engineState })

    // The handler is the only thing that knows what "look" means. Runtime and EngineState do
    // not: they carried the reference here without reading it.
    const look = workKind("test.look")
    const output: string[] = []
    runtime.handle(look, (_task, context) => {
      const room = context.world?.get(entityId("room-1"))
      output.push(room === undefined ? "you see nothing" : `${room.id} exists`)
    })

    // "Input: look" - submitted the same way any Work is: no session, no transport, just a Work.
    runtime.submit({ work: work(look, undefined) })
    await runtime.drain()

    // "Output: room-1 exists"
    expect(output).toEqual(["room-1 exists"])
  })

  it("sees a world mutation made by an earlier task", async () => {
    const world = new WorldState()
    const engineState: EngineState = { world }
    const runtime = new Runtime({ engineState })

    const create = workKind("test.create")
    const look = workKind("test.look")
    const output: string[] = []
    runtime.handle(create, (_task, context) => {
      context.world?.add(entity(entityId("room-1"), "test.room"))
    })
    runtime.handle(look, (_task, context) => {
      output.push(context.world?.has(entityId("room-1")) ? "room-1 exists" : "you see nothing")
    })

    runtime.submit({ work: work(create, undefined) })
    runtime.submit({ work: work(look, undefined) })
    await runtime.drain()

    expect(output).toEqual(["room-1 exists"])
  })

  it("answers 'you see nothing' when the room does not exist, proving this is really reading WorldState", async () => {
    const world = new WorldState()
    const engineState: EngineState = { world }
    const runtime = new Runtime({ engineState })

    const look = workKind("test.look")
    const output: string[] = []
    runtime.handle(look, (_task, context) => {
      const room = context.world?.get(entityId("room-1"))
      output.push(room === undefined ? "you see nothing" : `${room.id} exists`)
    })

    runtime.submit({ work: work(look, undefined) })
    await runtime.drain()

    expect(output).toEqual(["you see nothing"])
  })
})
