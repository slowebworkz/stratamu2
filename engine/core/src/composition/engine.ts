import { Sessions } from "@stratamu/engine-sessions"
import { WorldState } from "@stratamu/engine-world"
import type { Work } from "@stratamu/work"

import { Runtime } from "../runtime/index.ts"

/**
 * What `Engine` needs from an adapter: a way to give its handlers to a `Runtime`, and a way to
 * turn one piece of session input into `Work`. The fuller shape `@stratamu/adapter-test`'s
 * `TestAdapter` already has -- nothing here imports that package, or any other adapter package,
 * to make that true: `Input` is generic, inferred from whatever concrete adapter `Engine` is
 * constructed with, so this never has to name a specific input shape (`SessionInput` or
 * otherwise) to stay adapter-agnostic.
 */
export interface EngineAdapter<Input = unknown> {
  registerHandlers(runtime: Runtime): void
  parse(input: Input): readonly Work[]
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
 * for (const item of adapter.parse(input)) {
 *   runtime.submit({ work: item })
 * }
 * ```
 *
 * `Engine` is exactly that, made real: it owns construction of `world`, `sessions` and `runtime`
 * -- fresh ones, every time, the same as every probe's own `setup()` did -- calls
 * `adapter.registerHandlers` once, at construction, with its own `runtime`, and keeps the adapter
 * so `receive` can route input through it later. The two invariants this exists to keep: an
 * adapter never owns the `Runtime` or the `WorldState` -- `Engine` does, and only ever hands the
 * adapter a `Runtime` reference to register against, never a reference back to itself -- and
 * `Runtime` never knows an adapter exists, exactly as it did before `Engine` existed: it still
 * only calls whatever handler was registered for a `Work`'s `kind`. Associating the adapter with
 * a running `Engine` does not weaken that: the association is `Engine` holding the adapter, never
 * the adapter holding the `Engine`, `Runtime`, or `WorldState`.
 */
export class Engine<Input = unknown> {
  readonly runtime: Runtime
  readonly world: WorldState
  readonly sessions: Sessions
  readonly #adapter: EngineAdapter<Input>

  constructor(adapter: EngineAdapter<Input>) {
    this.world = new WorldState()
    this.sessions = new Sessions()
    this.runtime = new Runtime({ engineState: { world: this.world, sessions: this.sessions } })
    this.#adapter = adapter
    adapter.registerHandlers(this.runtime)
  }

  /**
   * The entry point through which normalized session input reaches the adapter, and then the
   * `Runtime`: parses `input` into zero, one, or more `Work` -- an adapter's grammar deciding
   * that, same as always -- and submits each. Does not drain the `Runtime`: running it, on
   * whatever schedule a real transport loop keeps, stays that caller's concern, decoupled from
   * any one piece of input arriving.
   */
  receive(input: Input): void {
    for (const item of this.#adapter.parse(input)) {
      this.runtime.submit({ work: item })
    }
  }
}
