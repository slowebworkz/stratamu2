import { entity } from "@stratamu/entity"
import { entityId } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { Engine } from "./engine.ts"
import type { EngineAdapter } from "./engine.ts"

/**
 * `Engine`'s own mechanics, adapter-agnostic: nothing here needs a real adapter, since all
 * `Engine` asks of one is `registerHandlers(runtime)` and `parse(input)`. Proves the invariants
 * `Engine` exists to keep, not any game semantics -- those are `@stratamu/adapter-test`'s
 * `engine-composition.test.ts`'s concern, composing a real adapter through this same seam.
 */

const ping = workKind("test.ping")

/** The smallest adapter that satisfies `EngineAdapter`: registers one handler, and `parse`
 * recognizes exactly one input, `"ping"`, ignoring everything else -- enough to prove `receive`
 * routes input through an adapter's own grammar, without needing a real one. */
function stubAdapter(onPing: () => void): EngineAdapter<string> {
  return {
    registerHandlers(runtime) {
      runtime.handle(ping, () => {
        onPing()
      })
    },
    parse(input) {
      return input === "ping" ? [work(ping, undefined)] : []
    },
  }
}

describe("Engine", () => {
  it("gives the adapter its own Runtime, once, at construction", () => {
    const seen: unknown[] = []
    const adapter: EngineAdapter = {
      registerHandlers(runtime) {
        seen.push(runtime)
      },
      parse: () => [],
    }

    const engine = new Engine(adapter)

    expect(seen).toEqual([engine.runtime])
  })

  it("threads its own world and sessions to a handler the adapter registered", async () => {
    const adapter: EngineAdapter = {
      registerHandlers(runtime) {
        runtime.handle(ping, (_task, context) => {
          context.world?.add(entity(entityId("probe"), "test.probe"))
        })
      },
      parse: () => [],
    }
    const engine = new Engine(adapter)

    engine.runtime.submit({ work: { kind: ping, input: undefined } })
    await engine.runtime.drain()

    expect(engine.world.has(entityId("probe"))).toBe(true)
  })

  it("gives each Engine its own fresh world, sessions and runtime", () => {
    const adapter: EngineAdapter = { registerHandlers() {}, parse: () => [] }

    const first = new Engine(adapter)
    const second = new Engine(adapter)

    expect(second.world).not.toBe(first.world)
    expect(second.sessions).not.toBe(first.sessions)
    expect(second.runtime).not.toBe(first.runtime)
  })

  it("receive() routes input through the adapter's own parse, then submits every resulting Work", async () => {
    let pinged = 0
    const engine = new Engine(stubAdapter(() => (pinged += 1)))

    engine.receive("ping")
    await engine.runtime.drain()

    expect(pinged).toBe(1)
  })

  it("receive() submits nothing for input the adapter's grammar does not recognize", async () => {
    let pinged = 0
    const engine = new Engine(stubAdapter(() => (pinged += 1)))

    engine.receive("xyzzy")

    expect(engine.runtime.pending).toBe(0)
    expect(pinged).toBe(0)
  })

  it("does not drain the Runtime itself: receive() only submits", () => {
    let pinged = 0
    const engine = new Engine(stubAdapter(() => (pinged += 1)))

    engine.receive("ping")

    // Submitted, but nothing has run yet -- draining stays the caller's own concern.
    expect(engine.runtime.pending).toBe(1)
    expect(pinged).toBe(0)
  })
})
