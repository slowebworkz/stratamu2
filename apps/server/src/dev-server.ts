import { spawn } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { isAlive, readPid, removePid, writePid } from "./process-tracking.ts"

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url))
const PID_FILE = join(PACKAGE_ROOT, ".dev-server.pid")
const MAIN_SCRIPT = join(PACKAGE_ROOT, "dist", "main.js")

/** How long `kill` waits for a graceful `SIGINT` shutdown before escalating to `SIGKILL`.
 * Comfortably longer than `shutdown.ts`'s own 5000ms default `drainTimeoutMs`, so a normal
 * graceful shutdown is never raced. */
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

/** Stops the tracked server, if one is running: `SIGINT` (the same signal Ctrl+C sends, reusing
 * the server's own existing graceful shutdown), escalating to `SIGKILL` if it doesn't stop in
 * time, so this never leaves an orphan behind. */
async function kill(): Promise<void> {
  const pid = reconcilePidFile()
  if (pid === undefined) {
    console.log("Server is not running.")
    return
  }

  console.log(`Stopping server (pid ${pid})...`)
  process.kill(pid, "SIGINT")
  const stopped = await waitWhileAlive(pid, KILL_TIMEOUT_MS)
  if (!stopped) {
    console.warn(`Server did not stop within ${KILL_TIMEOUT_MS}ms; sending SIGKILL.`)
    process.kill(pid, "SIGKILL")
    await waitWhileAlive(pid, KILL_TIMEOUT_MS)
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

  const child = spawn(process.execPath, [MAIN_SCRIPT], { stdio: "inherit" })
  if (child.pid !== undefined) {
    writePid(PID_FILE, child.pid)
  }

  const forward = (signal: NodeJS.Signals): void => {
    if (child.pid !== undefined && isAlive(child.pid)) {
      child.kill(signal)
    }
  }
  process.on("SIGINT", () => forward("SIGINT"))
  process.on("SIGTERM", () => forward("SIGTERM"))

  const exitCode = await new Promise<number>(resolve => {
    child.on("exit", code => resolve(code ?? 1))
  })
  removePid(PID_FILE)
  process.exitCode = exitCode
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
