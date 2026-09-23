import type { WorldState } from "./world-state.ts"

/**
 * What the engine executes against: the authoritative state a `Runtime` reads and mutates,
 * distinct from `Runtime`'s own bookkeeping (tasks, clocks, timelines, queues), which has no
 * opinion about game state at all.
 *
 * Deliberately minimal: `world` is its only member for now. `Sessions` and `Authority`, named
 * alongside `WorldState` in the architecture document's `Engine` sketch, are not here because
 * neither exists yet. This grows by adding fields as those are built, not by reserving space for
 * them now.
 */
export interface EngineState {
  readonly world: WorldState
}
