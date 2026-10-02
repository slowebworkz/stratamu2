import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { isAlive, readPid, removePid, tryClaimPid, writePid } from "../src/process-tracking.ts"

describe("process-tracking", () => {
  let dir: string | undefined

  afterEach(async () => {
    vi.restoreAllMocks()
    if (dir !== undefined) {
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
})
