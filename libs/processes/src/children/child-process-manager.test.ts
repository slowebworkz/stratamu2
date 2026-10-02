import { describe, expect, it } from "vitest"

import { ChildProcessManager } from "./child-process-manager.ts"
import type { ProcessDefinition } from "./process-definition.ts"

function nodeScript(script: string): ProcessDefinition {
  return { id: "test-script", executable: process.execPath, args: ["-e", script] }
}

const LONG_RUNNING = `
  process.on("SIGTERM", () => process.exit(0))
  console.log("ready")
  setInterval(() => {}, 1000)
`

const IGNORES_SIGTERM = `
  process.on("SIGTERM", () => {})
  console.log("ready")
  setInterval(() => {}, 1000)
`

describe("ChildProcessManager", () => {
  it("run() resolves with the process's result for a successful exit", async () => {
    const manager = new ChildProcessManager()
    const result = await manager.run(nodeScript("process.exit(0)"))
    expect(result.state).toBe("completed")
    expect(result.exitCode).toBe(0)
  })

  it("run() resolves (never rejects) for a spawn failure", async () => {
    const manager = new ChildProcessManager()
    const result = await manager.run({ id: "missing", executable: "stratamu-does-not-exist-xyz" })
    expect(result.state).toBe("failed")
  })

  it("start() tracks a live process via get(), which forgets it once it exits", async () => {
    const manager = new ChildProcessManager()
    const process = manager.start(nodeScript("setTimeout(() => process.exit(0), 50)"))

    expect(manager.get(process.id)).toBe(process)
    await process.settled
    expect(manager.get(process.id)).toBeUndefined()
  })

  it("get() returns undefined for an unknown id", () => {
    const manager = new ChildProcessManager()
    expect(manager.get("nonexistent")).toBeUndefined()
  })

  it("stop(id) stops the matching tracked process", async () => {
    const manager = new ChildProcessManager()
    const ready = new Promise<void>(resolve => {
      manager.events.on("process.stdout", ({ id, chunk }) => {
        if (id === process_.id && chunk.includes("ready")) {
          resolve()
        }
      })
    })
    const process_ = manager.start(nodeScript(LONG_RUNNING))
    await ready

    await manager.stop(process_.id)
    const result = await process_.settled
    expect(result.exitCode).toBe(0)
  })

  it("stop() for an unknown id is a no-op", async () => {
    const manager = new ChildProcessManager()
    await expect(manager.stop("nonexistent")).resolves.toBeUndefined()
  })

  it("stopAll() stops every tracked process and is safe to call again", async () => {
    const manager = new ChildProcessManager()
    const ready = (id: string): Promise<void> =>
      new Promise<void>(resolve => {
        const off = manager.events.on("process.stdout", event => {
          if (event.id === id && event.chunk.includes("ready")) {
            off()
            resolve()
          }
        })
      })

    const a = manager.start(nodeScript(LONG_RUNNING))
    const b = manager.start(nodeScript(LONG_RUNNING))
    await Promise.all([ready(a.id), ready(b.id)])

    await manager.stopAll()
    expect((await a.settled).exitCode).toBe(0)
    expect((await b.settled).exitCode).toBe(0)

    await expect(manager.stopAll()).resolves.toBeUndefined()
  })

  it("emits process.started and process.exited with the process's id", async () => {
    const manager = new ChildProcessManager()
    const started: unknown[] = []
    const exited: unknown[] = []
    manager.events.on("process.started", event => void started.push(event))
    manager.events.on("process.exited", event => void exited.push(event))

    const process = manager.start(nodeScript("process.exit(3)"))
    await process.settled

    expect(started).toEqual([{ id: process.id, pid: process.pid }])
    expect(exited).toEqual([{ id: process.id, exitCode: 3, signal: undefined }])
  })

  it("emits process.failed for a spawn failure", async () => {
    const manager = new ChildProcessManager()
    const failed: unknown[] = []
    manager.events.on("process.failed", event => void failed.push(event))

    const process = manager.start({ id: "missing", executable: "stratamu-does-not-exist-xyz" })
    await process.settled

    expect(failed).toHaveLength(1)
  })

  it("start() forwards stopTimeoutMs, instead of always falling back to the 5s default", async () => {
    const manager = new ChildProcessManager()
    const ready = new Promise<void>(resolve => {
      manager.events.on("process.stdout", ({ chunk }) => {
        if (chunk.includes("ready")) {
          resolve()
        }
      })
    })
    // timeoutMs is generous enough that it only fires after the child has had time to reach its
    // own "ready" line -- a short timeoutMs raced against the child process's real, variable
    // startup time is a flaky test, not a real assertion about stopTimeoutMs.
    const process = manager.start(nodeScript(IGNORES_SIGTERM), {
      timeoutMs: 300,
      stopTimeoutMs: 20,
    })
    await ready
    const startedAt = Date.now()

    const result = await process.settled
    expect(result.state).toBe("timed-out")
    expect(result.signal).toBe("SIGKILL")
    // Without forwarding, the escalation grace period silently falls back to 5000ms -- this
    // completing well under a second (measured from "ready", not from start, since timeoutMs
    // itself accounts for most of the elapsed time here) confirms stopTimeoutMs was actually used.
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })
})
