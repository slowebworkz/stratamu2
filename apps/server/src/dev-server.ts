import { spawn } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { isAlive, readPid, removePid, tryClaimPid, writePid } from "./process-tracking.ts"

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url))
const PID_FILE = join(PACKAGE_ROOT, ".dev-server.pid")
const MAIN_SCRIPT = join(PACKAGE_ROOT, "dist", "main.js")

/** How long `kill` waits for a graceful `SIGINT` shutdown before escalating to `SIGKILL`, and
 * again after `SIGKILL` before giving up. Comfortably longer than `shutdown.ts`'s own 5000ms
 * default `drainTimeoutMs`, so a normal graceful shutdown is never raced. */
const KILL_TIMEOUT_MS = 8000
const POLL_INTERVAL_MS = 150

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Clears a stale PID file (one whose process isn't actually running) if there is one, reporting
 * it. Returns the still-live pid, if any. */
function reconcilePidFile(): number | undefined {
  const pid = readPid(PID_FILE)
  if (pid === undefined) {
    return undefined
  }
  if (isAlive(pid)) {
    return pid
  }
  console.log(`Removing stale PID file from a previous run (pid ${pid} is no longer running).`)
  removePid(PID_FILE)
  return undefined
}

async function waitWhileAlive(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (isAlive(pid)) {
    if (Date.now() > deadline) {
      return false
    }
    await sleep(POLL_INTERVAL_MS)
  }
  return true
}

/** Sends `signal` to `pid`, returning whether it was actually delivered. `ESRCH` means the
 * process already exited between the caller's own liveness check and this call -- a real,
 * if narrow, race (nothing stops the server from finishing its own shutdown in that window), not
 * a programming error, so it's reported as "not delivered" rather than thrown. */
function signalIfAlive(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      return false
    }
    throw error
  }
}

/** Stops the tracked server, if one is running: `SIGINT` (the same signal Ctrl+C sends, reusing
 * the server's own existing graceful shutdown), escalating to `SIGKILL` if it doesn't stop in
 * time. Reports failure, and leaves the PID file in place, if the process is still alive even
 * after `SIGKILL` -- that's a real problem for the caller to know about, not something to paper
 * over by declaring success anyway. */
async function kill(): Promise<void> {
  const pid = reconcilePidFile()
  if (pid === undefined) {
    console.log("Server is not running.")
    return
  }

  console.log(`Stopping server (pid ${pid})...`)
  if (signalIfAlive(pid, "SIGINT")) {
    const stopped = await waitWhileAlive(pid, KILL_TIMEOUT_MS)
    if (!stopped) {
      console.warn(`Server did not stop within ${KILL_TIMEOUT_MS}ms; sending SIGKILL.`)
      if (signalIfAlive(pid, "SIGKILL")) {
        const killed = await waitWhileAlive(pid, KILL_TIMEOUT_MS)
        if (!killed) {
          console.error(`Server (pid ${pid}) is still running after SIGKILL.`)
          process.exitCode = 1
          return
        }
      }
    }
  }
  removePid(PID_FILE)
  console.log("Server stopped.")
}

/** Starts the server as a managed child process, attached to this terminal (`stdio: "inherit"`)
 * so its output stays visible here, exactly like the plain `dev` script -- the difference is that
 * its pid is tracked so a separate `dev:server:kill`/`dev:server:restart` invocation can find and
 * stop it. Refuses to start a second instance while one is already tracked and running. */
async function start(): Promise<void> {
  const existing = reconcilePidFile()
  if (existing !== undefined) {
    console.error(`Server already running (pid ${existing}).`)
    process.exitCode = 1
    return
  }

  // Claims the PID file exclusively before spawning anything, with this runner's own pid as a
  // placeholder: two `start` invocations racing past the check above could otherwise both decide
  // nothing is running and both spawn a server. The exclusive create (`tryClaimPid`) is atomic,
  // so only one of them can win; the loser reports whatever the winner left behind instead of
  // spawning a redundant second server.
  if (!tryClaimPid(PID_FILE, process.pid)) {
    const racingPid = readPid(PID_FILE)
    console.error(
      racingPid === undefined
        ? "Another start is already in progress."
        : `Server already running (pid ${racingPid}).`,
    )
    process.exitCode = 1
    return
  }

  const child = spawn(process.execPath, [MAIN_SCRIPT], { stdio: "inherit" })

  const forward = (signal: NodeJS.Signals): void => {
    if (child.pid !== undefined) {
      signalIfAlive(child.pid, signal)
    }
  }
  process.on("SIGINT", () => forward("SIGINT"))
  process.on("SIGTERM", () => forward("SIGTERM"))

  const result = await new Promise<{ code: number } | { error: Error }>(resolve => {
    child.on("spawn", () => {
      // Only now do we know the real pid to track; until this point the placeholder above (this
      // runner's own pid) holds the claim.
      if (child.pid !== undefined) {
        writePid(PID_FILE, child.pid)
      }
    })
    child.on("exit", code => resolve({ code: code ?? 1 }))
    // If spawning fails outright (the executable can't be launched at all), Node emits "error"
    // instead of -- or in addition to -- "exit". Without a listener here, an unhandled "error"
    // event throws and this promise would never settle, leaving the PID file claimed forever.
    child.on("error", error => resolve({ error }))
  })

  removePid(PID_FILE)
  if ("error" in result) {
    console.error("Failed to start the server:", result.error)
    process.exitCode = 1
    return
  }
  process.exitCode = result.code
}

async function restart(): Promise<void> {
  await kill()
  await start()
}

async function main(): Promise<void> {
  const command = process.argv[2]
  switch (command) {
    case "start":
      await start()
      return
    case "kill":
      await kill()
      return
    case "restart":
      await restart()
      return
    default:
      console.error("Usage: dev-server <start|kill|restart>")
      process.exitCode = 1
  }
}

await main()
