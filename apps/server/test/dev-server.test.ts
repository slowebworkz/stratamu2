import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Mock } from "vitest"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createDevServerRunner, type DevServerLog } from "../src/dev-server.ts"
import { readPid } from "../src/process-tracking.ts"

/** Polls instead of asserting immediately: the pid file is written asynchronously, inside the
 * child's own "spawn" event handler, relative to when `start()` is called. Same reasoning as
 * `adapters/abermud/test/login-flow.test.ts`'s own `waitFor`. */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`)
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/** Waits for the pid file to hold the *real* spawned child's pid, not `start`'s own placeholder
 * claim (this test process's own `process.pid` -- see the "Gotcha for in-process testing" comment
 * on `start()` in `dev-server.ts`) and, optionally, not some previously-seen pid either (for
 * asserting a `restart` produced a genuinely new process). */
async function waitForRealPid(file: string, excluding?: number): Promise<number> {
  await waitFor(() => {
    const pid = readPid(file)
    return pid !== undefined && pid !== process.pid && pid !== excluding
  })
  return readPid(file) as number
}

function quietLog(): DevServerLog & { log: Mock; warn: Mock; error: Mock } {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe("createDevServerRunner", () => {
  let dir: string | undefined

  afterEach(async () => {
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
      dir = undefined
    }
  })

  async function pidFile(): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), "stratamu-dev-server-"))
    return join(dir, ".dev-server.pid")
  }

  /** A trivial, controllable "server" -- a real child process, so signal delivery, exit codes,
   * and spawn failure are exercised against actual OS semantics, not a mock of them. `ready()`
   * resolves once the *current* child has confirmed (via its own stdout) that its signal handler
   * is actually registered: the OS process existing (which `waitForRealPid` confirms) is not the
   * same moment as the child's own script having run far enough to call `process.on(...)` --
   * sending a signal before that registration falls back to the default disposition (terminate by
   * signal) instead of the handler this test means to exercise. */
  function spawnScript(script: string): {
    spawnServer: () => ChildProcess
    ready: () => Promise<void>
  } {
    // The "data" listener is attached synchronously inside `spawnServer`, the moment the child is
    // created -- not lazily inside `ready()` -- so a child fast enough to print "ready" before a
    // test gets around to calling `ready()` is still correctly observed, instead of that first
    // "data" event firing with nothing yet listening for it.
    let readyPromise: Promise<void> | undefined
    return {
      spawnServer: () => {
        const child = spawn(process.execPath, ["-e", script])
        readyPromise = new Promise<void>(resolve => {
          child.stdout?.once("data", () => resolve())
        })
        return child
      },
      ready: () =>
        readyPromise ?? Promise.reject(new Error("spawnServer() hasn't been called yet")),
    }
  }

  // Registers the signal handler first, synchronously, then announces readiness -- so a test
  // that waits for "ready" on stdout is guaranteed the handler is already in place by then.
  const GRACEFUL = `
    process.on("SIGINT", () => process.exit(0))
    console.log("ready")
    setInterval(() => {}, 1000)
  `
  const IGNORES_SIGINT = `
    process.on("SIGINT", () => {})
    console.log("ready")
    setInterval(() => {}, 1000)
  `

  it("runs a full start/stop cycle: start tracks the pid, kill stops it gracefully", async () => {
    const file = await pidFile()
    const server = spawnScript(GRACEFUL)
    const runner = createDevServerRunner({
      pidFile: file,
      spawnServer: server.spawnServer,
      log: quietLog(),
    })

    const starting = runner.start()
    await waitForRealPid(file)
    await server.ready()

    const stopped = await runner.kill()
    expect(stopped).toBe(true)
    expect(readPid(file)).toBeUndefined()
    expect(await starting).toBe(0)
  })

  it("restart stops the running instance and starts a new one", async () => {
    const file = await pidFile()
    const server = spawnScript(GRACEFUL)
    const runner = createDevServerRunner({
      pidFile: file,
      spawnServer: server.spawnServer,
      log: quietLog(),
    })

    const firstRun = runner.start()
    const firstPid = await waitForRealPid(file)
    await server.ready()

    const secondRun = runner.restart()
    const secondPid = await waitForRealPid(file, firstPid)
    await server.ready()
    expect(secondPid).not.toBe(firstPid)

    await runner.kill()
    expect(await firstRun).toBe(0)
    expect(await secondRun).toBe(0)
  })

  it("kill is a no-op when nothing is running", async () => {
    const file = await pidFile()
    const log = quietLog()
    const runner = createDevServerRunner({
      pidFile: file,
      spawnServer: spawnScript("process.exit(0)").spawnServer,
      log,
    })

    expect(await runner.kill()).toBe(true)
    expect(log.log).toHaveBeenCalledWith("Server is not running.")
  })

  it("escalates to SIGKILL when the server doesn't respond to SIGINT, and still reports success once it's actually gone", async () => {
    const file = await pidFile()
    const log = quietLog()
    const server = spawnScript(IGNORES_SIGINT)
    const runner = createDevServerRunner({
      pidFile: file,
      spawnServer: server.spawnServer,
      killTimeoutMs: 300,
      pollIntervalMs: 20,
      log,
    })

    const starting = runner.start()
    await waitForRealPid(file)
    await server.ready()

    const stopped = await runner.kill()
    expect(stopped).toBe(true)
    expect(readPid(file)).toBeUndefined()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("sending SIGKILL"))
    await starting
  })

  it("start() resolves with a nonzero code and cleans up when the child fails to spawn at all", async () => {
    const file = await pidFile()
    const log = quietLog()
    const runner = createDevServerRunner({
      pidFile: file,
      spawnServer: () => spawn("stratamu-this-command-does-not-exist-xyz", []),
      log,
    })

    const code = await runner.start()
    expect(code).toBe(1)
    expect(log.error).toHaveBeenCalledWith("Failed to start the server:", expect.any(Error))
    expect(readPid(file)).toBeUndefined()
  })

  it("start() resolves with the child's own exit code", async () => {
    const file = await pidFile()
    const runner = createDevServerRunner({
      pidFile: file,
      spawnServer: spawnScript("process.exit(7)").spawnServer,
      log: quietLog(),
    })

    expect(await runner.start()).toBe(7)
    expect(readPid(file)).toBeUndefined()
  })

  it("refuses to start a second instance while one is already running", async () => {
    const file = await pidFile()
    const log = quietLog()
    const runner = createDevServerRunner({
      pidFile: file,
      spawnServer: spawnScript(GRACEFUL).spawnServer,
      log,
    })

    const firstRun = runner.start()
    await waitForRealPid(file)

    expect(await runner.start()).toBe(1)
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("already running"))

    await runner.kill()
    await firstRun
  })

  it("a second concurrent start refuses to spawn a duplicate", async () => {
    const file = await pidFile()
    let spawnCount = 0
    const server = spawnScript(GRACEFUL)
    const runner = createDevServerRunner({
      pidFile: file,
      spawnServer: () => {
        spawnCount++
        return server.spawnServer()
      },
      log: quietLog(),
    })

    const results = Promise.all([runner.start(), runner.start()])
    // The loser resolves immediately; the winner blocks until its child exits, so it must be
    // killed before awaiting both, not after.
    await waitForRealPid(file)
    await server.ready()
    await runner.kill()
    const [first, second] = await results

    // Only one of the two concurrent calls should have actually spawned anything -- the other
    // must have lost the race and refused immediately.
    expect(spawnCount).toBe(1)
    expect([first, second].sort()).toEqual([0, 1])
  })

  it("onSpawned is called once with the real child pid", async () => {
    const file = await pidFile()
    const spawned: number[] = []
    const runner = createDevServerRunner({
      pidFile: file,
      spawnServer: spawnScript("process.exit(0)").spawnServer,
      onSpawned: pid => spawned.push(pid),
      log: quietLog(),
    })

    await runner.start()
    expect(spawned).toHaveLength(1)
  })
})
