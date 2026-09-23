import type { ISettingsParam, Transport } from "tslog"
import { Logger } from "tslog"
import { describe, expect, it } from "vitest"

import { TslogLogger } from "./tslog-logger.ts"
import type { ActiveLogLevel, LoggingCapability } from "./types.ts"

interface LogRecord extends Record<string, unknown> {
  level: string
  message?: string
  time?: string
}

/** `attachTransport`'s bare-function form gets tslog's raw, positional-args "logObj" -- not the
 * shaped `{message, level, time, ...}` record `json.messageKey`/etc. describe. That shape is only
 * what the *formatted line* carries, so capturing it means a full `Transport`, parsing `line` --
 * the same `destination.write(chunk)` -> `JSON.parse(chunk)` pattern the previous pino-backed
 * tests used. */
function jsonTransport(records: LogRecord[]): Transport<unknown> {
  return {
    write(_record, line) {
      records.push(JSON.parse(line) as LogRecord)
    },
  }
}

function capture(settings: ISettingsParam<unknown> = {}) {
  const records: LogRecord[] = []
  const log = TslogLogger.create(
    { type: "hidden", minLevel: "TRACE", ...settings },
    jsonTransport(records),
  )
  return { log, records }
}

describe("TslogLogger levels", () => {
  it.each<ActiveLogLevel>(["trace", "debug", "info", "warn", "error", "fatal"])(
    "%s writes a record with the matching level name",
    level => {
      const { log, records } = capture()

      log[level]("hello")

      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({ level: level.toUpperCase(), message: "hello" })
    },
  )

  it("drops records below the configured level", () => {
    const { log, records } = capture({ minLevel: "WARN" })

    log.info("dropped")
    log.warn("kept")

    expect(records.map(record => record.message)).toEqual(["kept"])
  })
})

describe("TslogLogger arguments", () => {
  it("merges a context object with the message", () => {
    const { log, records } = capture()

    log.info({ playerId: "p1", roomId: "r1" }, "Player entered room")

    expect(records[0]).toMatchObject({
      playerId: "p1",
      roomId: "r1",
      message: "Player entered room",
    })
  })

  it("serializes an Error passed as the context", () => {
    const { log, records } = capture()

    log.error(new Error("disk full"), "World failed to save")

    expect(records[0]).toMatchObject({ message: "World failed to save" })
    expect(records[0]?.error).toMatchObject({
      name: "Error",
      message: "disk full",
    })
  })

  it("carries the error under its own key rather than promoting its message, when no message is given", () => {
    const { log, records } = capture()

    log.error(new Error("boom"))

    // Unlike the previous pino-backed logger, tslog does not promote an Error's own message to
    // the record's top-level message when none is given -- the record simply carries no message
    // at all, and the Error's message is still there, under `error.message`.
    expect(records[0]?.message).toBeUndefined()
    expect(records[0]?.error).toMatchObject({ message: "boom" })
  })

  it("serializes an Error found nested under any field name in a fields object, not just 'error'", () => {
    const { log, records } = capture()

    // The actual shape the one real caller in this codebase uses (Runtime, logging a failed
    // task): an Error as an ordinary field's value, under a name of the caller's own choosing.
    // tslog's own handling only recognizes an Error passed directly, so this is the case that
    // most needs covering -- tslog silently drops it instead of serializing it, unless this
    // class normalizes it first.
    log.error({ err: new Error("disk full"), task: "test.say" }, "Task failed")

    expect(records[0]).toMatchObject({ message: "Task failed", task: "test.say" })
    expect(records[0]?.err).toMatchObject({ name: "Error", message: "disk full" })
  })
})

describe("TslogLogger bindings", () => {
  it("does not let a log call override a binding, and emits the key once", () => {
    const records: LogRecord[] = []
    const log = TslogLogger.create(
      { type: "hidden", minLevel: "TRACE" },
      jsonTransport(records),
    ).child({
      component: "World",
    })

    log.info({ component: "spoof", playerId: "p1" }, "entered")

    expect(records[0]).toMatchObject({ component: "World", playerId: "p1", message: "entered" })
  })

  it("protects the bindings of every ancestor", () => {
    const { log, records } = capture()

    log
      .child({ component: "World" })
      .child({ request: "r1" })
      .info({ component: "x", request: "y", extra: 1 }, "nested")

    expect(records[0]).toMatchObject({ component: "World", request: "r1", extra: 1 })
  })

  it("passes a context through untouched when it does not collide", () => {
    const { log, records } = capture()

    log.child({ component: "World" }).info({ playerId: "p1" }, "no collision")

    expect(records[0]).toMatchObject({ component: "World", playerId: "p1" })
  })

  it("still serializes an Error passed as the context on a logger with bindings", () => {
    const { log, records } = capture()

    log.child({ component: "World" }).error(new Error("disk full"), "failed")

    expect(records[0]).toMatchObject({ component: "World", message: "failed" })
    expect(records[0]?.error).toMatchObject({ message: "disk full" })
  })
})

describe("TslogLogger child loggers", () => {
  it("adds bindings to child records without affecting the parent", () => {
    const { log, records } = capture()

    const session = log.child({ subsystem: "session" })
    const player = session.child({ playerId: "p1" })

    player.info("from player")
    session.info("from session")
    log.info("from root")

    expect(records[0]).toMatchObject({ subsystem: "session", playerId: "p1" })
    expect(records[1]).toMatchObject({ subsystem: "session" })
    expect(records[1]).not.toHaveProperty("playerId")
    expect(records[2]).not.toHaveProperty("subsystem")
  })

  it("returns a LoggingCapability", () => {
    const { log } = capture()

    const child: LoggingCapability = log.child({ subsystem: "world" })

    expect(child).toBeInstanceOf(TslogLogger)
  })

  it("inherits the parent's level at creation", () => {
    const { log } = capture()

    log.setLevel("warn")

    expect(log.child({}).level).toBe("warn")
  })
})

describe("TslogLogger level control", () => {
  it("reports the configured level", () => {
    const { log } = capture({ minLevel: "INFO" })

    expect(log.level).toBe("info")
    expect(log.isLevelEnabled("info")).toBe(true)
    expect(log.isLevelEnabled("debug")).toBe(false)
  })

  it("applies level changes to the same instance in both directions", () => {
    const { log, records } = capture({ minLevel: "INFO" })

    log.debug("before")
    log.setLevel("debug")
    log.debug("after raise")
    log.setLevel("error")
    log.warn("after lower")

    expect(records.map(record => record.message)).toEqual(["after raise"])
    expect(log.level).toBe("error")
    expect(log.isLevelEnabled("warn")).toBe(false)
  })

  it("stops writing when set to silent", () => {
    const { log, records } = capture()

    log.setLevel("silent")
    log.fatal("never written")

    expect(records).toHaveLength(0)
    expect(log.level).toBe("silent")
    expect(log.isLevelEnabled("fatal")).toBe(false)
  })
})

describe("TslogLogger redaction", () => {
  it("redacts sensitive fields by default, at any depth", () => {
    const { log, records } = capture()

    log.info({ password: "hunter2", user: { password: "hunter2", name: "ada" } }, "login")

    expect(records[0]?.password).toBe("[***]")
    expect(records[0]?.user).toEqual({ password: "[***]", name: "ada" })
  })

  it("replaces the default keys when mask is provided", () => {
    const { log, records } = capture({ mask: { keys: ["custom"] } })

    log.info({ password: "visible", custom: "hidden" }, "override")

    expect(records[0]?.password).toBe("visible")
    expect(records[0]?.custom).toBe("[***]")
  })
})

describe("TslogLogger flush", () => {
  it("resolves when there is no attached transport", async () => {
    const log = TslogLogger.create({ type: "hidden" })

    await expect(log.flush()).resolves.toBeUndefined()
  })

  it("resolves after an attached transport's own flush runs", async () => {
    let flushed = false
    const log = TslogLogger.create(
      { type: "hidden" },
      {
        write() {},
        flush: async () => {
          flushed = true
        },
      },
    )

    await log.flush()

    expect(flushed).toBe(true)
  })

  it("isolates a failing transport flush instead of rejecting", async () => {
    const log = TslogLogger.create(
      { type: "hidden" },
      {
        write() {},
        flush: async () => {
          throw new Error("flush failed")
        },
      },
    )

    await expect(log.flush()).resolves.toBeUndefined()
  })
})

describe("TslogLogger construction", () => {
  it("writes an ISO timestamp by default", () => {
    const { log, records } = capture()

    log.info("timestamped")

    expect(records[0]?.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it("wraps an existing tslog Logger instance", () => {
    const records: LogRecord[] = []
    const logger = new Logger({ type: "hidden", minLevel: "INFO" })
    logger.attachTransport(jsonTransport(records))

    new TslogLogger(logger).info("wrapped")

    expect(records[0]).toMatchObject({ level: "INFO", message: "wrapped" })
  })
})
