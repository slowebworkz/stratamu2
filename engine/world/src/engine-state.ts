import type { Sessions } from "@stratamu/engine-sessions"

import type { WorldState } from "./world-state.ts"

/**
 * What the engine executes against: the authoritative state a `Runtime` reads and mutates,
 * distinct from `Runtime`'s own bookkeeping (tasks, clocks, timelines, queues), which has no
 * opinion about game state at all.
 *
 * `world` is required; `sessions` is optional, and grew in here the same way `world` originally
 * did -- once a real operation (session lifecycle) needed it, not designed in ahead of that need.
 * Optional so every earlier proof that constructs an `EngineState` with only `world` keeps
 * compiling unchanged: session lifecycle is a capability a `Runtime` can have, not one every
 * caller of this interface is now required to provide. `Authority`, named alongside `WorldState`
 * and `Sessions` in the architecture document's `Engine` sketch, is still not here because it
 * does not exist yet.
 */
export interface EngineState {
  readonly world: WorldState
  readonly sessions?: Sessions
}
