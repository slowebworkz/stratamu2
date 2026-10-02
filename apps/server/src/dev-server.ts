import type { ChildProcess } from "node:child_process"
import { spawn } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { isDefined } from "@stratamu/guards"

import {
  isAlive,
  readPid,
  readStartingClaim,
  removeIfOwns,
  removePid,
  signalIfAlive,
  tryClaimStarting,
  writePid,
} from "./process-tracking.ts"

/** Just enough of `Console` to report the runner's own lifecycle messages -- not `Console` itself,
 * whose overloaded signatures a plain `{ log: vi.fn(), ... }` test double can't structurally
 * satisfy (the same fix already applied to `ShutdownLog`/`RuntimeDriverLog`). */
export interface DevServerLog {
  log(message: string): void
  warn(message: string): void
  error(message: string, error?: unknown): void
}

export interface DevServerRunnerOptions {
  readonly pidFile: string
  /** Starts the server, returning the `ChildProcess` to track. Injected, not a hardcoded
   * `spawn(...)` call, so a test can launch a trivial, controllable script instead of the real
   * server build. */
  readonly spawnServer: () => ChildProcess
  /** How long `kill` waits for a graceful `SIGINT` shutdown before escalating to `SIGKILL`, and
   * again after `SIGKILL` before giving up. Default 8000ms -- comfortably longer than
   * `shutdown.ts`'s own 5000ms default `drainTimeoutMs`, so a normal graceful shutdown is never
   * raced. */
  readonly killTimeoutMs?: number
  readonly pollIntervalMs?: number
  readonly log?: DevServerLog
  /** Called once the spawned child's real pid is known, replacing the "starting" claim `start`
   * makes before spawning -- a CLI wrapper uses this to forward signals its own process receives
   * to the child; tests can ignore it. */
  readonly onSpawned?: (pid: number) => void
}

export interface DevServerRunner {
  /** Starts the server. Resolves with its exit code once it stops, for any reason -- including a
   * failure to spawn at all, represented as `1` -- so a caller can always set `process.exitCode`
   * from the result without a separate error-handling path. Refuses (resolving `1` immediately)
   * if the server is already tracked and running, or if a concurrent `start` wins the race to
   * claim the PID file first. */
  start(): Promise<number>
  /** Stops the tracked server, if one is running. Resolves `true` once confirmed stopped (or if
   * nothing was running), `false` if it's still alive even after escalating to `SIGKILL`. */
  kill(): Promise<boolean>
  /** `kill()` (a no-op if nothing is running) followed by `start()`. */
  restart(): Promise<number>
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * The start/stop/restart lifecycle behind `pnpm dev:server`/`dev:server:kill`/`dev:server:restart`
 * (see `docs/DEVELOPMENT_SERVER.md`). Deliberately free of global side effects -- no `process.on`,
 * no `process.exitCode` mutation -- so it's directly testable with injected, trivial child
 * processes (see `test/dev-server.test.ts`) instead of only through manual smoke testing; the real
 * CLI entry point at the bottom of this file is the one place that wires it to the actual process.
 */
export function createDevServerRunner(options: DevServerRunnerOptions): DevServerRunner {
  const {
    pidFile,
    spawnServer,
    killTimeoutMs = 8000,
    pollIntervalMs = 150,
    log = console,
    onSpawned,
  } = options

  /** Clears a stale PID file (one whose process isn't actually running) or a stale "starting"
   * marker (one left behind by a runner that crashed before it finished spawning) if there is
   * one, reporting it either way. Returns the still-live server pid, if any -- a live "starting"
   * claim has no pid to return yet, so that case (another start is genuinely still in progress)
   * is also represented as `undefined`, the same as nothing being tracked at all; callers that
   * need to tell the two apart check `readStartingClaim` themselves. */
  function reconcilePidFile(): number | undefined {
    const pid = readPid(pidFile)
    if (isDefined(pid)) {
      if (isAlive(pid)) {
        return pid
      }
      log.log(`Removing stale PID file from a previous run (pid ${pid} is no longer running).`)
      removePid(pidFile)
      return undefined
    }

    const claim = readStartingClaim(pidFile)
    if (isDefined(claim) && !isAlive(claim.runnerPid)) {
      log.log(
        `Removing a stale "starting" marker from a crashed start (pid ${claim.runnerPid} is no longer running).`,
      )
      removePid(pidFile)
    }
    return undefined
  }

  async function waitWhileAlive(pid: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (isAlive(pid)) {
      if (Date.now() > deadline) {
        return false
      }
      await sleep(pollIntervalMs)
    }
    return true
  }

  async function kill(): Promise<boolean> {
    const pid = reconcilePidFile()
    if (!isDefined(pid)) {
      log.log("Server is not running.")
      return true
    }

    log.log(`Stopping server (pid ${pid})...`)
    if (signalIfAlive(pid, "SIGINT")) {
      const stopped = await waitWhileAlive(pid, killTimeoutMs)
      if (!stopped) {
        log.warn(`Server did not stop within ${killTimeoutMs}ms; sending SIGKILL.`)
        if (signalIfAlive(pid, "SIGKILL")) {
          const killed = await waitWhileAlive(pid, killTimeoutMs)
          if (!killed) {
            log.error(`Server (pid ${pid}) is still running after SIGKILL.`)
            return false
          }
        }
      }
    }
    removeIfOwns(pidFile, pid)
    log.log("Server stopped.")
    return true
  }

  async function start(): Promise<number> {
    const existing = reconcilePidFile()
    if (isDefined(existing)) {
      log.error(`Server already running (pid ${existing}).`)
      return 1
    }

    // Claims the PID file exclusively before spawning anything, with a "starting" marker (not yet
    // a server pid, since the real one isn't known until the child actually spawns): two `start`
    // invocations racing past the check above could otherwise both decide nothing is running and
    // both spawn a server. The exclusive create (`tryClaimStarting`) is atomic, so only one of
    // them can win; the loser reports whatever the winner left behind instead of spawning a
    // redundant second server. Unlike an earlier design that used this runner's own pid as the
    // placeholder, the marker is never a plain digit string, so `readPid`/`isAlive` can never
    // mistake it for a live, signalable server process -- a concurrent `kill()` during this window
    // sees "nothing to stop yet" instead of risking a signal to the wrong process.
    if (!tryClaimStarting(pidFile, process.pid)) {
      log.error("Another start is already in progress.")
      return 1
    }

    const child = spawnServer()
    const result = await new Promise<{ code: number } | { error: Error }>(resolve => {
      child.on("spawn", () => {
        // Only now do we know the real pid to track; until this point the "starting" marker above
        // holds the claim.
        if (child.pid !== undefined) {
          writePid(pidFile, child.pid)
          onSpawned?.(child.pid)
        }
      })
      child.on("exit", code => resolve({ code: code ?? 1 }))
      // If spawning fails outright (the executable can't be launched at all), Node emits "error"
      // instead of -- or in addition to -- "exit". Without a listener here, an unhandled "error"
      // event throws and this promise would never settle, leaving the PID file claimed forever.
      child.on("error", error => resolve({ error }))
    })

    // Removes only whatever this call itself claimed -- the real child pid once "spawn" fired, or
    // still the original "starting" marker if it never got that far (e.g. an immediate "error").
    // An unconditional removal here could otherwise delete a newer start's claim: if this
    // tracked process had already been confirmed stopped and cleaned up by a concurrent `kill()`
    // by the time this resolves, a new `start()` could already have claimed the file again.
    removeIfOwns(pidFile, child.pid ?? `starting:${process.pid}`)
    if ("error" in result) {
      log.error("Failed to start the server:", result.error)
      return 1
    }
    return result.code
  }

  async function restart(): Promise<number> {
    const stopped = await kill()
    if (!stopped) {
      log.error("Failed to stop the running server; not starting a new one.")
      return 1
    }
    return start()
  }

  return { start, kill, restart }
}

// Everything below is the CLI entry point, not part of the testable factory above -- guarded so
// that importing `createDevServerRunner` (as `test/dev-server.test.ts` does) never also runs it
// as a side effect of the import. ES modules execute all of a file's top-level code regardless of
// which export a caller actually wanted, so without this check, merely importing this module from
// a test would also invoke `main()` against the test runner's own `process.argv`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url))
  const PID_FILE = join(PACKAGE_ROOT, ".dev-server.pid")
  const MAIN_SCRIPT = join(PACKAGE_ROOT, "dist", "main.js")

  const runner = createDevServerRunner({
    pidFile: PID_FILE,
    spawnServer: () => spawn(process.execPath, [MAIN_SCRIPT], { stdio: "inherit" }),
    onSpawned: pid => {
      process.on("SIGINT", () => signalIfAlive(pid, "SIGINT"))
      process.on("SIGTERM", () => signalIfAlive(pid, "SIGTERM"))
    },
  })

  const command = process.argv[2]
  switch (command) {
    case "start":
      process.exitCode = await runner.start()
      break
    case "kill":
      process.exitCode = (await runner.kill()) ? 0 : 1
      break
    case "restart":
      process.exitCode = await runner.restart()
      break
    default:
      console.error("Usage: dev-server <start|kill|restart>")
      process.exitCode = 1
  }
}
