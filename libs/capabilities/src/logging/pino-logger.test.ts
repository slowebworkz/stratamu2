import type { LoggerOptions } from "pino"
import { pino } from "pino"
import { describe, expect, it } from "vitest"

import { PinoLogger } from "./pino-logger.ts"
import type { ActiveLogLevel, LoggingCapability } from "./types.ts"

interface LogRecord extends Record<string, unknown> {
  level: number
  msg?: string
  time?: string
}

interface FlushableDestination {
  write(chunk: string): void
  flush(callback: (error?: Error) => void): void
}

function capture(options: LoggerOptions = {}) {
  const records: LogRecord[] = []
  const destination = {
    write(chunk: string) {
      records.push(JSON.parse(chunk) as LogRecord)
    },
  }
  const log = PinoLogger.create({ level: "trace", ...options }, destination)
  return { log, records, destination }
}

describe("PinoLogger levels", () => {
  it.each<[ActiveLogLevel, number]>([
    ["trace", 10],
    ["debug", 20],
    ["info", 30],
    ["warn", 40],
    ["error", 50],
    ["fatal", 60],
  ])("%s writes a record with pino level %i", (level, numeric) => {
    const { log, records } = capture()

    log[level]("hello")

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ level: numeric, msg: "hello" })
  })

  it("drops records below the configured level", () => {
    const { log, records } = capture({ level: "warn" })

    log.info("dropped")
    log.warn("kept")

    expect(records.map(record => record.msg)).toEqual(["kept"])
  })
})

describe("PinoLogger arguments", () => {
  it("merges a context object with the message", () => {
    const { log, records } = capture()

    log.info({ playerId: "p1", roomId: "r1" }, "Player entered room")

    expect(records[0]).toMatchObject({
      playerId: "p1",
      roomId: "r1",
      msg: "Player entered room",
    })
  })

  it("serializes an Error passed as the context", () => {
    const { log, records } = capture()

    log.error(new Error("disk full"), "World failed to save")

    expect(records[0]).toMatchObject({ msg: "World failed to save" })
    expect(records[0]?.err).toMatchObject({
      type: "Error",
      message: "disk full",
      stack: expect.any(String),
    })
  })

  it("uses the error message when no message is given", () => {
    const { log, records } = capture()

    log.error(new Error("boom"))

    expect(records[0]?.msg).toBe("boom")
  })
})

describe("PinoLogger bindings", () => {
  it("does not let a log call override a binding, and emits the key once", () => {
    const lines: string[] = []
    const log = PinoLogger.create({ level: "trace" }, { write: chunk => lines.push(chunk) }).child({
      component: "World",
    })

    log.info({ component: "spoof", playerId: "p1" }, "entered")

    const record = JSON.parse(lines[0] ?? "{}") as LogRecord
    expect(record).toMatchObject({ component: "World", playerId: "p1", msg: "entered" })
    expect(lines[0]?.match(/"component":/g)).toHaveLength(1)
  })

  it("protects the bindings of every ancestor", () => {
    const { log, records } = capture()

    log
      .child({ component: "World" })
      .child({ request: "r1" })
      .info({ component: "x", request: "y", extra: 1 }, "nested")

    expect(records[0]).toMatchObject({ component: "World", request: "r1", extra: 1 })
  })

  it("protects the fields configured on the root logger", () => {
    const { log, records } = capture({ base: { app: "stratamu2" } })

    log.info({ app: "other", kept: true }, "root")

    expect(records[0]).toMatchObject({ app: "stratamu2", kept: true })
  })

  it("passes a context through untouched when it does not collide", () => {
    const { log, records } = capture()

    log.child({ component: "World" }).info({ playerId: "p1" }, "no collision")

    expect(records[0]).toMatchObject({ component: "World", playerId: "p1" })
  })

  it("lets a logger without bindings accept any field", () => {
    const { log, records } = capture({ base: null })

    log.info({ component: "free" }, "root has no bindings")

    expect(records[0]?.component).toBe("free")
  })

  it("still serializes an Error passed as the context on a logger with bindings", () => {
    const { log, records } = capture()

    log.child({ component: "World" }).error(new Error("disk full"), "failed")

    expect(records[0]).toMatchObject({ component: "World", msg: "failed" })
    expect(records[0]?.err).toMatchObject({ message: "disk full" })
  })
})

describe("PinoLogger child loggers", () => {
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

    expect(child).toBeInstanceOf(PinoLogger)
  })

  it("inherits the parent's level at creation", () => {
    const { log } = capture()

    log.setLevel("warn")

    expect(log.child({}).level).toBe("warn")
  })
})

describe("PinoLogger level control", () => {
  it("reports the configured level", () => {
    const { log } = capture({ level: "info" })

    expect(log.level).toBe("info")
    expect(log.isLevelEnabled("info")).toBe(true)
    expect(log.isLevelEnabled("debug")).toBe(false)
  })

  it("applies level changes to the same instance in both directions", () => {
    const { log, records } = capture({ level: "info" })

    log.debug("before")
    log.setLevel("debug")
    log.debug("after raise")
    log.setLevel("error")
    log.warn("after lower")

    expect(records.map(record => record.msg)).toEqual(["after raise"])
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

describe("PinoLogger redaction", () => {
  it("redacts sensitive fields by default, including one level of nesting", () => {
    const { log, records } = capture()

    log.info({ password: "hunter2", user: { password: "hunter2", name: "ada" } }, "login")

    expect(records[0]?.password).toBe("[Redacted]")
    expect(records[0]?.user).toEqual({ password: "[Redacted]", name: "ada" })
  })

  it("replaces the default paths when redact is provided", () => {
    const { log, records } = capture({ redact: ["custom"] })

    log.info({ password: "visible", custom: "hidden" }, "override")

    expect(records[0]?.password).toBe("visible")
    expect(records[0]?.custom).toBe("[Redacted]")
  })
})

describe("PinoLogger flush", () => {
  it("resolves when the destination has no flush method", async () => {
    const { log } = capture()

    await expect(log.flush()).resolves.toBeUndefined()
  })

  it("resolves after the destination flushes", async () => {
    let flushed = false
    const destination: FlushableDestination = {
      write() {},
      flush(callback) {
        flushed = true
        callback()
      },
    }
    const log = PinoLogger.create({ level: "info" }, destination)

    await log.flush()

    expect(flushed).toBe(true)
  })

  it("rejects when the destination fails to flush", async () => {
    const destination: FlushableDestination = {
      write() {},
      flush(callback) {
        callback(new Error("flush failed"))
      },
    }
    const log = PinoLogger.create({ level: "info" }, destination)

    await expect(log.flush()).rejects.toThrow("flush failed")
  })
})

describe("PinoLogger construction", () => {
  it("writes an ISO timestamp by default", () => {
    const { log, records } = capture()

    log.info("timestamped")

    expect(records[0]?.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it("wraps an existing pino logger", () => {
    const records: LogRecord[] = []
    const destination = {
      write(chunk: string) {
        records.push(JSON.parse(chunk) as LogRecord)
      },
    }

    new PinoLogger(pino({ level: "info" }, destination)).info("wrapped")

    expect(records[0]).toMatchObject({ level: 30, msg: "wrapped" })
  })
})
