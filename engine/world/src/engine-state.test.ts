import { Sessions } from "@stratamu/engine-sessions"
import { entity } from "@stratamu/entity"
import { entityId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import type { EngineState } from "./engine-state.ts"
import { WorldState } from "./world-state.ts"

describe("EngineState", () => {
  it("is what the engine executes against: its world, for now", () => {
    const world = new WorldState()
    world.add(entity(entityId("room-1"), "test.room"))
    const state: EngineState = { world }

    expect(state.world.size).toBe(1)
  })

  it("accepts sessions, but does not require it", () => {
    const world = new WorldState()
    const sessions = new Sessions()
    const state: EngineState = { world, sessions }

    expect(state.sessions?.size).toBe(0)
  })
})
