import { readFileSync, unlinkSync, writeFileSync } from "node:fs"

/** A pid is a point-in-time identifier, not a durable identity: once the process holding it exits,
 * the OS is free to reuse the same number for something unrelated. `isAlive` can only ever confirm
 * "a process with this pid currently exists", not "it's still the one this file originally
 * named" -- an acceptable limitation for a local development-server runner, not something this
 * module tries to paper over with stronger (and heavier) identity tracking. */
function isValidPid(pid: number): boolean {
  return Number.isSafeInteger(pid) && pid > 0
}

/** Reads a PID file written by `writePid`. Returns `undefined` if the file doesn't exist or its
 * contents aren't a complete, valid PID -- a dev-server runner treats either as "nothing
 * tracked", not an error. A read failure other than "missing file" (permissions, say) is a real
 * problem, not an absent PID, so it's rethrown rather than also treated as untracked. */
export function readPid(pidFile: string): number | undefined {
  let contents: string
  try {
    contents = readFileSync(pidFile, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }

  const value = contents.trim()
  // The whole trimmed string must be digits -- Number.parseInt alone would accept "123abc" as 123.
  if (!/^\d+$/.test(value)) {
    return undefined
  }
  const pid = Number(value)
  return isValidPid(pid) ? pid : undefined
}

/** Writes `pid` to `pidFile`, overwriting whatever was there. */
export function writePid(pidFile: string, pid: number): void {
  if (!isValidPid(pid)) {
    throw new RangeError(`Invalid PID: ${pid}`)
  }
  writeFileSync(pidFile, `${pid}\n`, "utf8")
}

/** Creates `pidFile` with `pid`, but only if it doesn't already exist -- an atomic claim (the
 * underlying `O_EXCL` open is a single OS-level operation), unlike "check whether a pid file
 * exists, then write one", which has a window between the check and the write where two
 * concurrent callers can both see nothing there and both proceed. Returns whether the claim
 * succeeded; `false` means something else already holds it (a real run, or another `start` that
 * won the race). */
export function tryClaimPid(pidFile: string, pid: number): boolean {
  if (!isValidPid(pid)) {
    throw new RangeError(`Invalid PID: ${pid}`)
  }
  try {
    writeFileSync(pidFile, `${pid}\n`, { encoding: "utf8", flag: "wx" })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false
    }
    throw error
  }
}

/** Removes `pidFile`. A no-op if it doesn't exist -- callers don't need to check first. */
export function removePid(pidFile: string): void {
  try {
    unlinkSync(pidFile)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }
}

/** Whether a process with this pid is currently running. `process.kill(pid, 0)` sends no signal;
 * it only probes for the process's existence. `ESRCH` means there is none; `EPERM` means there
 * is one but this process lacks permission to signal it -- still alive, just not ours to confirm
 * further -- so only `ESRCH` means "dead" and anything else unexpected is rethrown rather than
 * silently treated as either. */
export function isAlive(pid: number): boolean {
  if (!isValidPid(pid)) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ESRCH") {
      return false
    }
    if (code === "EPERM") {
      return true
    }
    throw error
  }
}
