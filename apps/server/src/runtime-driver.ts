import type { Runtime } from "@stratamu/engine-core"

/** What the driver needs from a combat clock: advance by one tick. `ManualClock<TDomain>` (see
 * `@stratamu/clock`) satisfies this with `advance(Duration.from<TDomain>(1n))`; kept this narrow
 * so the driver doesn't need to know the clock's domain. */
export interface TickableClock {
  advance(): void
}

export interface RuntimeDriverOptions {
  readonly runtime: Runtime
  readonly combatClock: TickableClock
  /** Real milliseconds between ticks. Default 1000: one combat round per second. */
  readonly tickMs?: number
  /** `pump`'s step budget per tick -- a ceiling on work done in one tick, not a target; unused
   * budget is never wasted, since work left ready simply waits for the next tick (see
   * `Runtime.pump`'s own doc comment). Default 50, independent of `LoginFlow`'s own per-line
   * budget. */
  readonly stepBudget?: number
}

export interface RuntimeDriver {
  /** Starts ticking. Calling it again while already started is an error -- the same discipline
   * `Runtime.step` uses for re-entrant calls. */
  start(): void
  /** Stops scheduling further ticks and resolves once any tick already in flight has finished,
   * so a caller that destroys sockets right after `stop()` never does so mid-step. Safe to call
   * before `start()` or more than once. */
  stop(): Promise<void>
  /** Runs the runtime once, right now, without advancing the combat clock or disturbing the
   * regular tick's own schedule -- for a caller that just submitted work (ordinary input, say)
   * and wants it to run sooner than the next scheduled tick, without becoming a second owner of
   * `pump`. A no-op if the driver isn't running, or if a pump -- scheduled or kicked -- is already
   * in flight: that pump's own step loop re-checks what's ready on every iteration, so the new
   * work is still picked up by it, or at worst by the next scheduled tick -- never worse than
   * `tickMs` late, the same bound ordinary ticking already has. Never advancing the clock here
   * matters: a continuously-typing player must not be able to speed up or stall combat by how
   * often they send input, which is the entire reason this driver owns `pump` in the first
   * place. */
  kick(): void
}

/**
 * The server-owned driver `docs/DEVELOPMENT_SERVER.md` and the engine-core README both call for:
 * something on the environment side that advances the combat clock and pumps the runtime on its
 * own schedule, independent of client input. `apps/server` owns it, not `@stratamu/plugin-telnet`
 * or `@stratamu/adapter-abermud` -- see `docs/GAME_ENGINE_ARCHITECTURE.md`'s Apps section.
 *
 * A recursive `setTimeout`, not a bare `setInterval`: each tick awaits its own `pump` to finish
 * before the next is scheduled, so a slow step never causes overlapping ticks.
 */
export function createRuntimeDriver(options: RuntimeDriverOptions): RuntimeDriver {
  const { runtime, combatClock, tickMs = 1000, stepBudget = 50 } = options

  let running = false
  let busy = false
  let timer: NodeJS.Timeout | undefined
  let inFlight: Promise<void> = Promise.resolve()

  const runPump = async (): Promise<void> => {
    busy = true
    try {
      await runtime.pump(stepBudget)
    } finally {
      busy = false
    }
  }

  const tick = async (): Promise<void> => {
    combatClock.advance()
    await runPump()
    if (running) {
      timer = setTimeout(() => {
        inFlight = tick()
      }, tickMs)
    }
  }

  return {
    start() {
      if (running) {
        throw new Error("The runtime driver is already started")
      }
      running = true
      timer = setTimeout(() => {
        inFlight = tick()
      }, tickMs)
    },
    async stop() {
      running = false
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      await inFlight
    },
    kick() {
      if (!running || busy) {
        return
      }
      inFlight = runPump()
    },
  }
}
