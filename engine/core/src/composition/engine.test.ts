import { entity } from "@stratamu/entity"
import { entityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"
import { describe, expect, it } from "vitest"

import { Engine } from "./engine.ts"
import type { EngineAdapter } from "./engine.ts"

/**
 * `Engine`'s own mechanics, adapter-agnostic: nothing here needs a real adapter, since all
 * `Engine` asks of one is `registerHandlers(runtime)`. Proves the two invariants `Engine` exists
 * to keep, not any game semantics -- those are `@stratamu/adapter-test`'s
 * `engine-composition.test.ts`'s concern, composing a real adapter through this same seam.
 */

const ping = workKind("test.ping")

describe("Engine", () => {
  it("gives the adapter its own Runtime, once, at construction", () => {
    const seen: unknown[] = []
    const adapter: EngineAdapter = {
      registerHandlers(runtime) {
        seen.push(runtime)
      },
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
    }
    const engine = new Engine(adapter)

    engine.runtime.submit({ work: { kind: ping, input: undefined } })
    await engine.runtime.drain()

    expect(engine.world.has(entityId("probe"))).toBe(true)
  })

  it("gives each Engine its own fresh world, sessions and runtime", () => {
    const adapter: EngineAdapter = { registerHandlers() {} }

    const first = new Engine(adapter)
    const second = new Engine(adapter)

    expect(second.world).not.toBe(first.world)
    expect(second.sessions).not.toBe(first.sessions)
    expect(second.runtime).not.toBe(first.runtime)
  })
})
