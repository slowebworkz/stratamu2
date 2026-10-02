import { describe, expect, it } from "vitest"

import { createManagedProcess } from "./managed-process.ts"
import type { ProcessDefinition } from "./process-definition.ts"

/** A trivial, controllable "process" -- a real child process (`node -e <script>`), so signal
 * delivery, exit codes, and spawn failure are exercised against actual OS semantics, not a mock of
 * them. Same technique `apps/server/test/dev-server.test.ts` already uses. */
function nodeScript(script: string): ProcessDefinition {
  return { id: "test-script", executable: process.execPath, args: ["-e", script] }
}

/** Registers the signal handler first, synchronously, then announces readiness over stdout -- a
 * test that waits for "ready" is guaranteed the handler is already in place by then. Sending a
 * signal before that registration would fall back to the default disposition instead of
 * exercising the handler this test means to test. */
const IGNORES_SIGTERM = `
  process.on("SIGTERM", () => {})
  console.log("ready")
  setInterval(() => {}, 1000)
`

describe("createManagedProcess", () => {
  it("resolves settled with the exit code for a process that exits successfully", async () => {
    const process = createManagedProcess(nodeScript("process.exit(0)"))
    const result = await process.settled
    expect(result.state).toBe("completed")
    expect(result.exitCode).toBe(0)
  })

  it("reports a nonzero exit as completed, not failed", async () => {
    const process = createManagedProcess(nodeScript("process.exit(7)"))
    const result = await process.settled
    expect(result.state).toBe("completed")
    expect(result.exitCode).toBe(7)
  })

  it("reports a spawn failure as failed, with an error, never throwing", async () => {
    const process = createManagedProcess({
      id: "missing",
      executable: "stratamu-this-command-does-not-exist-xyz",
    })
    const result = await process.settled
    expect(result.state).toBe("failed")
    expect(result.error).toBeDefined()
    expect(process.state).toBe("failed")
  })

  it("captures stdout and stderr", async () => {
    const process = createManagedProcess(
      nodeScript('process.stdout.write("out"); process.stderr.write("err"); process.exit(0)'),
    )
    const result = await process.settled
    expect(result.stdout).toBe("out")
    expect(result.stderr).toBe("err")
    expect(result.stdoutTruncated).toBe(false)
    expect(result.stderrTruncated).toBe(false)
  })

  it("truncates output past maxOutputBytes and flags it", async () => {
    const process = createManagedProcess(
      nodeScript('process.stdout.write("x".repeat(100)); process.exit(0)'),
      { maxOutputBytes: 10 },
    )
    const result = await process.settled
    expect(result.stdout).toHaveLength(10)
    expect(result.stdoutTruncated).toBe(true)
  })

  it("stop() escalates to SIGKILL when the process ignores SIGTERM", async () => {
    let ready: () => void = () => {}
    const readyPromise = new Promise<void>(resolve => {
      ready = resolve
    })
    const process = createManagedProcess(nodeScript(IGNORES_SIGTERM), {
      hooks: {
        onStdout: chunk => {
          if (chunk.includes("ready")) {
            ready()
          }
        },
      },
    })
    await readyPromise

    await process.stop({ timeoutMs: 200 })
    const result = await process.settled
    expect(result.signal).toBe("SIGKILL")
  })

  it("kill() sends SIGKILL immediately", async () => {
    let ready: () => void = () => {}
    const readyPromise = new Promise<void>(resolve => {
      ready = resolve
    })
    const process = createManagedProcess(nodeScript(IGNORES_SIGTERM), {
      hooks: {
        onStdout: chunk => {
          if (chunk.includes("ready")) {
            ready()
          }
        },
      },
    })
    await readyPromise

    await process.kill()
    const result = await process.settled
    expect(result.signal).toBe("SIGKILL")
  })

  it("an external AbortSignal cancels the process, escalating the same way stop() does", async () => {
    let ready: () => void = () => {}
    const readyPromise = new Promise<void>(resolve => {
      ready = resolve
    })
    const controller = new AbortController()
    const process = createManagedProcess(nodeScript(IGNORES_SIGTERM), {
      signal: controller.signal,
      stopTimeoutMs: 50,
      hooks: {
        onStdout: chunk => {
          if (chunk.includes("ready")) {
            ready()
          }
        },
      },
    })
    await readyPromise

    controller.abort()
    const result = await process.settled
    expect(result.state).toBe("cancelled")
    expect(result.signal).toBe("SIGKILL")
  })

  it("timeoutMs cancels a long-running process as timed-out", async () => {
    const process = createManagedProcess(nodeScript("setInterval(() => {}, 1000)"), {
      timeoutMs: 100,
    })
    const result = await process.settled
    expect(result.state).toBe("timed-out")
  })

  it("write() returns false once the process has exited", async () => {
    const process = createManagedProcess(nodeScript("process.exit(0)"))
    await process.settled
    expect(process.write("data")).toBe(false)
  })
})
