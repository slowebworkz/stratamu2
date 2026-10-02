import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { isDefined } from "@stratamu/guards"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  isAlive,
  readPid,
  readStartingClaim,
  removeIfOwns,
  removePid,
  signalIfAlive,
  tryClaimPid,
  tryClaimStarting,
  withPidFileLock,
  writePid,
} from "../src/process-tracking.ts"

describe("process-tracking", () => {
  let dir: string | undefined

  afterEach(async () => {
    vi.restoreAllMocks()
    if (isDefined(dir)) {
      await rm(dir, { recursive: true, force: true })
      dir = undefined
    }
  })

  async function pidFile(): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), "stratamu-process-tracking-"))
    return join(dir, ".dev-server.pid")
  }

  it("readPid returns undefined when the file doesn't exist", async () => {
    expect(readPid(await pidFile())).toBeUndefined()
  })

  it("round-trips a pid through writePid and readPid", async () => {
    const file = await pidFile()
    writePid(file, 12345)
    expect(readPid(file)).toBe(12345)
  })

  it("readPid returns undefined for a file whose contents aren't a complete integer", async () => {
    const file = await pidFile()
    // Written directly, bypassing writePid's own validation, to exercise readPid's parsing of
    // whatever a PID file might actually contain (corruption, manual editing, a partial write).
    writeFileSync(file, "123abc", "utf8")
    expect(readPid(file)).toBeUndefined()
  })

  it("readPid does not accept a string merely beginning with digits", async () => {
    const file = await pidFile()
    writeFileSync(file, "123 leftover", "utf8")
    expect(readPid(file)).toBeUndefined()
  })

  it("writePid rejects a non-positive or non-integer pid", async () => {
    const file = await pidFile()
    expect(() => writePid(file, 0)).toThrow(RangeError)
    expect(() => writePid(file, -1)).toThrow(RangeError)
    expect(() => writePid(file, 1.5)).toThrow(RangeError)
    expect(() => writePid(file, Number.NaN)).toThrow(RangeError)
  })

  it("tryClaimPid succeeds and writes the pid when the file doesn't exist", async () => {
    const file = await pidFile()
    expect(tryClaimPid(file, 42)).toBe(true)
    expect(readPid(file)).toBe(42)
  })

  it("tryClaimPid fails without overwriting when the file already exists", async () => {
    const file = await pidFile()
    writePid(file, 1)
    expect(tryClaimPid(file, 2)).toBe(false)
    expect(readPid(file)).toBe(1)
  })

  it("tryClaimPid rejects a non-positive or non-integer pid", async () => {
    const file = await pidFile()
    expect(() => tryClaimPid(file, 0)).toThrow(RangeError)
  })

  it("removePid is a no-op when the file doesn't exist", async () => {
    const file = await pidFile()
    expect(() => removePid(file)).not.toThrow()
  })

  it("removePid deletes an existing file", async () => {
    const file = await pidFile()
    writePid(file, 1)
    removePid(file)
    expect(readPid(file)).toBeUndefined()
  })

  it("isAlive is true for the current process", () => {
    expect(isAlive(process.pid)).toBe(true)
  })

  it("isAlive is false for a pid that has exited", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(0)"])
    const exitedPid = await new Promise<number>(resolve => {
      child.on("exit", () => resolve(child.pid as number))
    })
    expect(isAlive(exitedPid)).toBe(false)
  })

  it("isAlive is false for an invalid pid, without signaling anything", () => {
    const kill = vi.spyOn(process, "kill")
    expect(isAlive(0)).toBe(false)
    expect(isAlive(-1)).toBe(false)
    expect(isAlive(1.5)).toBe(false)
    expect(kill).not.toHaveBeenCalled()
  })

  it("isAlive is true when the process exists but signaling it is refused (EPERM)", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("Operation not permitted"), { code: "EPERM" })
    })
    expect(isAlive(1)).toBe(true)
  })

  it("isAlive rethrows an unexpected error from process.kill", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("something else"), { code: "EINVAL" })
    })
    expect(() => isAlive(123)).toThrow("something else")
  })

  it("signalIfAlive delivers the signal and returns true when the process exists", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true)
    expect(signalIfAlive(123, "SIGINT")).toBe(true)
    expect(kill).toHaveBeenCalledWith(123, "SIGINT")
  })

  it("signalIfAlive returns false when the process has already exited (ESRCH)", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("No such process"), { code: "ESRCH" })
    })
    expect(signalIfAlive(123, "SIGINT")).toBe(false)
  })

  it("signalIfAlive rethrows EPERM, unlike isAlive", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("Operation not permitted"), { code: "EPERM" })
    })
    expect(() => signalIfAlive(123, "SIGINT")).toThrow("Operation not permitted")
  })

  it("signalIfAlive rethrows an unexpected error", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("something else"), { code: "EINVAL" })
    })
    expect(() => signalIfAlive(123, "SIGINT")).toThrow("something else")
  })

  it("tryClaimStarting succeeds and encodes the runner pid when the file doesn't exist", async () => {
    const file = await pidFile()
    expect(tryClaimStarting(file, 42)).toBe(true)
    expect(readStartingClaim(file)).toEqual({ runnerPid: 42 })
  })

  it("tryClaimStarting fails without overwriting when the file already exists", async () => {
    const file = await pidFile()
    writePid(file, 1)
    expect(tryClaimStarting(file, 2)).toBe(false)
    expect(readPid(file)).toBe(1)
  })

  it("tryClaimStarting rejects a non-positive or non-integer runner pid", async () => {
    const file = await pidFile()
    expect(() => tryClaimStarting(file, 0)).toThrow(RangeError)
  })

  it("readPid does not mistake a starting marker for a plain pid", async () => {
    const file = await pidFile()
    tryClaimStarting(file, 42)
    expect(readPid(file)).toBeUndefined()
  })

  it("readStartingClaim returns undefined when the file doesn't exist or holds a plain pid", async () => {
    const file = await pidFile()
    expect(readStartingClaim(file)).toBeUndefined()
    writePid(file, 7)
    expect(readStartingClaim(file)).toBeUndefined()
  })

  it("removeIfOwns deletes the file when its contents match", async () => {
    const file = await pidFile()
    writePid(file, 1)
    removeIfOwns(file, 1)
    expect(readPid(file)).toBeUndefined()
  })

  it("removeIfOwns leaves the file untouched when its contents don't match", async () => {
    const file = await pidFile()
    writePid(file, 1)
    // Simulates a newer claim (a concurrent start) having replaced this call's own tracked pid by
    // the time it gets around to cleaning up -- it must not delete someone else's claim.
    writePid(file, 2)
    removeIfOwns(file, 1)
    expect(readPid(file)).toBe(2)
  })

  it("removeIfOwns is a no-op when the file doesn't exist", async () => {
    const file = await pidFile()
    expect(() => removeIfOwns(file, 1)).not.toThrow()
  })

  it("withPidFileLock serializes overlapping critical sections instead of interleaving them", async () => {
    const file = await pidFile()
    const events: string[] = []

    async function criticalSection(id: string): Promise<void> {
      await withPidFileLock(file, async () => {
        events.push(`${id}:enter`)
        await new Promise(resolve => setTimeout(resolve, 20))
        events.push(`${id}:exit`)
      })
    }

    await Promise.all([criticalSection("a"), criticalSection("b")])

    // Each section's enter/exit must be adjacent -- if the lock let them interleave, a second
    // section's "enter" would land between the first's "enter" and "exit".
    for (let i = 0; i < events.length; i += 2) {
      const id = events[i]?.split(":")[0]
      expect(events[i]).toBe(`${id}:enter`)
      expect(events[i + 1]).toBe(`${id}:exit`)
    }
  })

  it("withPidFileLock closes the race where a cleanup could delete a newer claim", async () => {
    const file = await pidFile()
    writePid(file, 1)
    const events: string[] = []

    // Simulates the exact race this was written to close: one caller is in the middle of
    // confirming pid 1 is done and cleaning up, while a second caller is waiting to claim the
    // file for a new pid 2. Without the lock, the cleanup's read-then-unlink could interleave with
    // the new claim and delete pid 2's entry instead of pid 1's.
    const cleanup = withPidFileLock(file, async () => {
      events.push("cleanup:start")
      await new Promise(resolve => setTimeout(resolve, 30))
      removeIfOwns(file, 1)
      events.push("cleanup:end")
    })
    await new Promise(resolve => setTimeout(resolve, 5))
    const newClaim = withPidFileLock(file, () => {
      events.push("claim:start")
      tryClaimPid(file, 2)
      events.push("claim:end")
    })

    await Promise.all([cleanup, newClaim])

    expect(events).toEqual(["cleanup:start", "cleanup:end", "claim:start", "claim:end"])
    expect(readPid(file)).toBe(2)
  })

  it("withPidFileLock reclaims a lock left behind by a holder that's since died", async () => {
    const file = await pidFile()
    const lockFile = `${file}.lock`
    const child = spawn(process.execPath, ["-e", "process.exit(0)"])
    const deadPid = await new Promise<number>(resolve => {
      child.on("exit", () => resolve(child.pid as number))
    })
    // A lock claimed by a runner that crashed before releasing it -- `withPidFileLock` must
    // recognize this as stale and reclaim it, not wait out its full acquisition timeout.
    writePid(lockFile, deadPid)

    const start = Date.now()
    await withPidFileLock(file, () => {})
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
