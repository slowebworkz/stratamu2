import type { Clock, MonotonicTime } from "@stratamu/clock"
import { MonotonicClock } from "@stratamu/clock"
import type { Runtime } from "@stratamu/engine-core"
import { Instant } from "@stratamu/primitives"

/** What the driver needs from a combat clock: advance by a whole number of ticks. `ManualClock<TDomain>`
 * (see `@stratamu/clock`) satisfies this with `advance(Duration.from<TDomain>(BigInt(units)))`;
 * kept this narrow so the driver doesn't need to know the clock's domain. A count, not a fixed
 * single bump, so a tick that fires having measured more than one `tickMs` of real elapsed time
 * (see `RuntimeDriverOptions.monotonicClock`) can advance by that many units in one call, rather
 * than silently falling behind real time. */
export interface TickableClock {
  advance(units: number): void
}

/** Just enough of a logger to report a tick failure -- not `Pick<Console, "error">` itself, whose
 * overloaded signature a plain `{ error: vi.fn() }` test double can't structurally satisfy (the
 * same fix already applied to `ShutdownLog` in `./shutdown.ts`). */
export interface RuntimeDriverLog {
  error(message: string, error: unknown): void
}

export interface RuntimeDriverOptions {
  readonly runtime: Runtime
  readonly combatClock: TickableClock
  /** Real milliseconds per combat-clock unit. Default 1000: one combat round per second. */
  readonly tickMs?: number
  /** `pump`'s step budget per tick -- a ceiling on work done in one tick, not a target; unused
   * budget is never wasted, since work left ready simply waits for the next tick (see
   * `Runtime.pump`'s own doc comment). Default 50, independent of `LoginFlow`'s own per-line
   * budget. */
  readonly stepBudget?: number
  /** The real-time source a tick measures elapsed time against, to know how many whole `tickMs`
   * units actually passed since the last one -- injected, not reached for, the same reason
   * `combatClock` itself is a parameter rather than something the driver constructs: a test needs
   * a controllable source of elapsed time, not real `performance.now()`. Defaults to
   * `new MonotonicClock()`. */
  readonly monotonicClock?: Clock<Instant<MonotonicTime>>
  /** Where a tick failure (a thrown/rejected `combatClock.advance()` or `runtime.pump()`) is
   * reported. Defaults to `console.error`. */
  readonly log?: RuntimeDriverLog
}

export interface RuntimeDriver {
  /** Starts ticking. Calling it again while already started is an error -- the same discipline
   * `Runtime.step` uses for re-entrant calls. */
  start(): void
  /** Stops scheduling further ticks and resolves once every pump already queued or in flight --
   * scheduled or kicked -- has finished, so a caller that destroys sockets right after `stop()`
   * never does so mid-step. Safe to call before `start()` or more than once. */
  stop(): Promise<void>
  /** Runs the runtime once, right now, without advancing the combat clock or disturbing the
   * regular tick's own schedule -- for a caller that just submitted work (ordinary input, say)
   * and wants it to run sooner than the next scheduled tick, without becoming a second owner of
   * `pump`. A no-op if the driver isn't running, or if a pump -- scheduled or kicked -- is already
   * queued or in flight: whichever one is already there re-checks what's ready on every
   * iteration, so the new work is still picked up by it, or at worst by the next scheduled tick --
   * never worse than `tickMs` late, the same bound ordinary ticking already has. Every pump,
   * whichever path requests it, runs through one serialized chain, so this never starts a second
   * `runtime.pump()` call alongside one already running. Never advancing the clock here matters:
   * a continuously-typing player must not be able to speed up or stall combat by how often they
   * send input, which is the entire reason this driver owns `pump` in the first place. */
  kick(): void
}

/**
 * The server-owned driver `docs/DEVELOPMENT_SERVER.md` and the engine-core README both call for:
 * something on the environment side that advances the combat clock and pumps the runtime on its
 * own schedule, independent of client input. `apps/server` owns it, not `@stratamu/plugin-telnet`
 * or `@stratamu/adapter-abermud` -- see `docs/GAME_ENGINE_ARCHITECTURE.md`'s Apps section.
 *
 * A recursive `setTimeout`, not a bare `setInterval`: each tick awaits its own `pump` to finish
 * before the next is scheduled, so a slow step never causes overlapping ticks. Scheduled ticks
 * and `kick()` share one serialized pump chain, so a kick's pump running long never causes a
 * concurrent second `runtime.pump()` call either -- a scheduled tick that comes due while a kick
 * is still running queues behind it instead.
 *
 * Each tick measures real elapsed time against `monotonicClock` rather than assuming exactly
 * `tickMs` passed (a `setTimeout` callback can fire late -- event-loop lag, a slow pump, a GC
 * pause -- never early), and advances the combat clock by however many whole `tickMs` units
 * actually elapsed, carrying any fractional remainder forward into the next tick's own
 * measurement rather than losing it every time (the standard fixed-timestep-with-accumulator
 * technique).
 *
 * A tick failure -- `combatClock.advance()` or `runtime.pump()` throwing/rejecting -- is caught,
 * logged, and does not stop future ticks from being scheduled: a single bad tick is survived, not
 * fatal to the driver for the rest of the process's life.
 */
export function createRuntimeDriver(options: RuntimeDriverOptions): RuntimeDriver {
  const {
    runtime,
    combatClock,
    tickMs = 1000,
    stepBudget = 50,
    monotonicClock = new MonotonicClock(),
    log = { error: (message, error) => console.error(message, error) },
  } = options

  let running = false
  let timer: NodeJS.Timeout | undefined
  let lastTickAt: Instant<MonotonicTime> = monotonicClock.now()

  // Every pump -- scheduled or kicked -- runs through this one chain, never concurrently: a new
  // request is appended after whatever is already running or queued, rather than starting
  // alongside it. `pending` is the chain's current depth, so `kick()` can cheaply skip adding
  // another link while one is already queued or in flight (the queued one will pick up the same
  // work once its turn comes -- see `kick`'s own doc comment). `stop()` awaits this same chain, so
  // it reliably waits for everything in it, whichever path put it there.
  let pumpChain: Promise<void> = Promise.resolve()
  let pending = 0

  const runPump = async (): Promise<void> => {
    try {
      await runtime.pump(stepBudget)
    } catch (error) {
      log.error("Runtime pump failed", error)
    }
  }

  const enqueuePump = (): Promise<void> => {
    pending++
    pumpChain = pumpChain.then(async () => {
      try {
        await runPump()
      } finally {
        pending--
      }
    })
    return pumpChain
  }

  const advanceCombatClock = (): void => {
    try {
      const now = monotonicClock.now()
      const elapsedMs = Number(now.value - lastTickAt.value)
      const units = Math.max(1, Math.floor(elapsedMs / tickMs))
      lastTickAt = Instant.from<MonotonicTime>(lastTickAt.value + BigInt(units) * BigInt(tickMs))
      combatClock.advance(units)
    } catch (error) {
      log.error("Combat clock advance failed", error)
    }
  }

  const tick = async (): Promise<void> => {
    // Advancing happens on this tick's own schedule, unaffected by queueing; only running the
    // pump itself waits its turn.
    advanceCombatClock()
    await enqueuePump()
    if (running) {
      timer = setTimeout(() => {
        void tick()
      }, tickMs)
    }
  }

  return {
    start() {
      if (running) {
        throw new Error("The runtime driver is already started")
      }
      running = true
      lastTickAt = monotonicClock.now()
      timer = setTimeout(() => {
        void tick()
      }, tickMs)
    },
    async stop() {
      running = false
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      await pumpChain
    },
    kick() {
      if (!running || pending > 0) {
        return
      }
      void enqueuePump()
    },
  }
}
