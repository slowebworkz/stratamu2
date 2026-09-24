import { Sessions } from "@stratamu/engine-sessions"
import { WorldState } from "@stratamu/engine-world"

import { Runtime } from "../runtime/index.ts"

/**
 * The one thing `Engine` needs from an adapter: a way to give its handlers to a `Runtime`.
 * Deliberately not the fuller two-capability adapter contract (`registerHandlers` plus
 * `parse`) `@stratamu/adapter-test`'s `TestAdapter` implements -- `Engine` never calls `parse`,
 * so it does not ask for it. `TestAdapter` still satisfies this structurally, with nothing extra
 * to implement; nothing here imports `@stratamu/adapter-test`, or any other adapter package, to
 * make that true.
 */
export interface EngineAdapter {
  registerHandlers(runtime: Runtime): void
}

/**
 * The smallest thing that composes a `Runtime`, an adapter, and the engine-owned state
 * (`WorldState`, `Sessions`) into one usable engine -- the seam every probe and the composed
 * adapter proof each assembled by hand until now:
 *
 * ```ts
 * const world = new WorldState()
 * const sessions = new Sessions()
 * const runtime = new Runtime({ engineState: { world, sessions } })
 * adapter.registerHandlers(runtime)
 * ```
 *
 * `Engine` is exactly that, and nothing more. It owns construction of `world`, `sessions` and
 * `runtime` -- fresh ones, every time, the same as every probe's own `setup()` did -- and calls
 * `adapter.registerHandlers` once, at construction, with its own `runtime`. It does not call
 * `parse`, does not accept input, and does not route anything: composing the pieces so a handler
 * can run is the whole job. The two invariants this exists to keep: an adapter never owns the
 * `Runtime` or the `WorldState` -- `Engine` does, and only ever hands the adapter a `Runtime`
 * reference to register against, never a reference back to itself -- and `Runtime` never knows
 * an adapter exists, exactly as it did before `Engine` existed: it still only calls whatever
 * handler was registered for a `Work`'s `kind`.
 */
export class Engine {
  readonly runtime: Runtime
  readonly world: WorldState
  readonly sessions: Sessions

  constructor(adapter: EngineAdapter) {
    this.world = new WorldState()
    this.sessions = new Sessions()
    this.runtime = new Runtime({ engineState: { world: this.world, sessions: this.sessions } })
    adapter.registerHandlers(this.runtime)
  }
}
