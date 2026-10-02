import { readFileSync, unlinkSync, writeFileSync } from "node:fs"

import { isDefined, isNonNullObject, isPositiveInteger, isString } from "@stratamu/guards"

interface ErrorWithCode {
  readonly code: string
}

function hasErrorCode(error: unknown, code: string): error is ErrorWithCode {
  return isNonNullObject(error) && "code" in error && isString(error.code) && error.code === code
}

/** Reads the raw trimmed contents of a PID file, or `undefined` if it doesn't exist. Shared by
 * `readPid` (which further requires the contents to be a plain pid) and the "starting" marker
 * helpers below (which don't). */
function readRaw(pidFile: string): string | undefined {
  try {
    return readFileSync(pidFile, "utf8").trim()
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return undefined
    }
    throw error
  }
}

/** Reads a PID file written by `writePid`. Returns `undefined` if the file doesn't exist or its
 * contents aren't a complete, valid PID -- a dev-server runner treats either as "nothing
 * tracked", not an error. A read failure other than "missing file" (permissions, say) is a real
 * problem, not an absent PID, so it's rethrown rather than also treated as untracked. */
export function readPid(pidFile: string): number | undefined {
  const value = readRaw(pidFile)
  if (!isDefined(value)) {
    return undefined
  }

  // The whole trimmed string must be digits -- Number.parseInt alone would accept "123abc" as 123.
  if (!/^\d+$/.test(value)) {
    return undefined
  }
  const pid = Number(value)
  return isPositiveInteger(pid) ? pid : undefined
}

/** Writes `pid` to `pidFile`, overwriting whatever was there. */
export function writePid(pidFile: string, pid: number): void {
  if (!isPositiveInteger(pid)) {
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
  if (!isPositiveInteger(pid)) {
    throw new RangeError(`Invalid PID: ${pid}`)
  }
  try {
    writeFileSync(pidFile, `${pid}\n`, { encoding: "utf8", flag: "wx" })
    return true
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) {
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
    if (!hasErrorCode(error, "ENOENT")) {
      throw error
    }
  }
}

/** Removes `pidFile` only if its contents still match `expectedContents`. A plain `removePid`
 * after confirming "the thing I was tracking is done" has a race: between that confirmation and
 * the unlink, a new claim (a new `start`) can land in the same file, and an unconditional removal
 * would delete someone else's claim instead of the caller's own. Comparing contents first makes
 * cleanup conditional on still owning what's there. */
export function removeIfOwns(pidFile: string, expectedContents: string | number): void {
  if (readRaw(pidFile) === String(expectedContents)) {
    removePid(pidFile)
  }
}

const STARTING_PREFIX = "starting:"

export interface StartingClaim {
  readonly runnerPid: number
}

/** Claims `pidFile` with a sentinel meaning "a start is in progress; the real server pid isn't
 * known yet" -- distinct from a plain pid so `readPid` never mistakes it for a signalable server
 * process (the bug this replaces: using the claiming runner's own pid as a placeholder, which
 * `readPid`/`isAlive` would treat as a live, trackable server). Encodes `runnerPid` so a crashed
 * start (the runner itself died before spawning) can later be recognized as stale, the same way a
 * dead server pid already is via `isAlive`. Same atomic `O_EXCL` mechanism as `tryClaimPid`. */
export function tryClaimStarting(pidFile: string, runnerPid: number): boolean {
  if (!isPositiveInteger(runnerPid)) {
    throw new RangeError(`Invalid PID: ${runnerPid}`)
  }
  try {
    writeFileSync(pidFile, `${STARTING_PREFIX}${runnerPid}\n`, { encoding: "utf8", flag: "wx" })
    return true
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) {
      return false
    }
    throw error
  }
}

/** Reads a starting-marker claim from `pidFile`, if it currently holds one rather than a server
 * pid or nothing. */
export function readStartingClaim(pidFile: string): StartingClaim | undefined {
  const raw = readRaw(pidFile)
  if (!isDefined(raw) || !raw.startsWith(STARTING_PREFIX)) {
    return undefined
  }
  const runnerPid = Number(raw.slice(STARTING_PREFIX.length))
  return isPositiveInteger(runnerPid) ? { runnerPid } : undefined
}

/** Whether a process with this pid is currently running. `process.kill(pid, 0)` sends no signal;
 * it only probes for the process's existence. `ESRCH` means there is none; `EPERM` means there
 * is one but this process lacks permission to signal it -- still alive, just not ours to confirm
 * further -- so only `ESRCH` means "dead" and anything else unexpected is rethrown rather than
 * silently treated as either.
 *
 * A pid is a point-in-time identifier, not a durable identity: once the process holding it exits,
 * the OS is free to reuse the same number for something unrelated. This can only ever confirm "a
 * process with this pid currently exists", not "it's still the one this file originally named" --
 * an acceptable limitation for a local development-server runner, not something this module tries
 * to paper over with stronger (and heavier) identity tracking. */
export function isAlive(pid: number): boolean {
  if (!isPositiveInteger(pid)) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (hasErrorCode(error, "ESRCH")) {
      return false
    }
    if (hasErrorCode(error, "EPERM")) {
      return true
    }
    throw error
  }
}

/** Sends `signal` to `pid`, returning whether it was actually delivered. `ESRCH` means the
 * process already exited between the caller's own liveness check and this call -- a real, if
 * narrow, race (nothing stops the target process from finishing its own shutdown in that window),
 * not a programming error, so it's reported as "not delivered" rather than thrown. Unlike
 * `isAlive`, `EPERM` is rethrown here rather than treated as success: this signals a process the
 * caller itself spawned, so a permission failure is a genuine, unexpected problem worth
 * surfacing, not evidence the process is merely alive. */
export function signalIfAlive(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal)
    return true
  } catch (error) {
    if (hasErrorCode(error, "ESRCH")) {
      return false
    }
    throw error
  }
}
