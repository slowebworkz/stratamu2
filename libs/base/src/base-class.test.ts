import type { LoggingCapability } from "@stratamu/capabilities"
import { afterEach, describe, expect, it, vi } from "vitest"

interface LogRecord {
  level: string
  message?: string
  component?: string
  [key: string]: unknown
}

async function loadFresh() {
  vi.resetModules()

  const records: LogRecord[] = []
  // The bare-function transport form gets tslog's raw, positional-args "logObj", not the shaped
  // record; a full transport's `line` parameter carries that shape, the same
  // `destination.write` -> `JSON.parse` pattern the previous pino-backed test used.
  const transport = {
    write(_record: unknown, line: string) {
      records.push(JSON.parse(line) as LogRecord)
    },
  }

  const { TslogLogger, setRootLogger } = await import("@stratamu/capabilities")
  const createReal = TslogLogger.create.bind(TslogLogger)
  const create = vi
    .spyOn(TslogLogger, "create")
    .mockImplementation(() => createReal({ type: "hidden", minLevel: "TRACE" }, transport))

  const { Base } = await import("./base-class.ts")

  class Quiet extends Base {}

  class Talker extends Base {
    get exposed(): LoggingCapability {
      return this.log
    }
  }

  class OtherTalker extends Base {
    get exposed(): LoggingCapability {
      return this.log
    }
  }

  class SubTalker extends Talker {}

  return {
    Base,
    TslogLogger,
    create,
    createReal,
    records,
    setRootLogger,
    Quiet,
    Talker,
    OtherTalker,
    SubTalker,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Base logging: root logger", () => {
  it("logs through the root logger the application configured, without creating a default", async () => {
    const { create, createReal, records, setRootLogger, Talker } = await loadFresh()
    const configured: LogRecord[] = []
    setRootLogger(
      createReal(
        { type: "hidden", minLevel: "INFO" },
        {
          write(_record: unknown, line: string) {
            configured.push(JSON.parse(line) as LogRecord)
          },
        },
      ),
    )

    new Talker().exposed.info("configured")

    expect(create).not.toHaveBeenCalled()
    expect(records).toEqual([])
    expect(configured).toMatchObject([{ component: "Talker", message: "configured" }])
  })

  it("creates nothing when no class uses log", async () => {
    const { create, records, Quiet, Talker } = await loadFresh()

    new Quiet()
    new Talker()

    expect(create).not.toHaveBeenCalled()
    expect(records).toEqual([])
  })

  it("creates the root logger on first access and only once for every class and instance", async () => {
    const { create, Talker, OtherTalker } = await loadFresh()

    const logs = [new Talker().exposed, new Talker().exposed, new OtherTalker().exposed]

    expect(logs.every(log => log !== undefined)).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe("Base logging: per-object child logger", () => {
  it("provides a LoggingCapability backed by TslogLogger", async () => {
    const { TslogLogger, Talker } = await loadFresh()

    const log: LoggingCapability = new Talker().exposed

    expect(log).toBeInstanceOf(TslogLogger)
  })

  it("binds the class name as the component on every record", async () => {
    const { records, Talker, OtherTalker } = await loadFresh()

    new Talker().exposed.info("loaded")
    new OtherTalker().exposed.info("entered")

    expect(records).toMatchObject([
      { component: "Talker", message: "loaded" },
      { component: "OtherTalker", message: "entered" },
    ])
  })

  it("binds the concrete subclass name, not the parent's", async () => {
    const { records, SubTalker } = await loadFresh()

    new SubTalker().exposed.info("from the subclass")

    expect(records[0]?.component).toBe("SubTalker")
  })

  it("falls back to a readable component for an anonymous subclass", async () => {
    const { Base, records } = await loadFresh()
    const anonymous = new (class extends Base {
      get exposed(): LoggingCapability {
        return this.log
      }
    })()

    anonymous.exposed.info("from an anonymous class")

    expect(records[0]?.component).toBe("anonymous")
  })

  it("keeps the component when a child of the object's logger is created", async () => {
    const { records, Talker } = await loadFresh()

    new Talker().exposed.child({ request: "r1" }).info("nested")

    expect(records[0]).toMatchObject({ component: "Talker", request: "r1", message: "nested" })
  })

  it("applies the root logger's default redaction to child records", async () => {
    const { records, Talker } = await loadFresh()

    new Talker().exposed.info({ password: "hunter2", user: { token: "abc", name: "ada" } }, "login")

    expect(records[0]?.password).toBe("[***]")
    expect(records[0]?.user).toEqual({ token: "[***]", name: "ada" })
  })

  it("reuses the same child on every access from one instance", async () => {
    const { Talker } = await loadFresh()
    const talker = new Talker()

    const first = talker.exposed
    const again = talker.exposed

    expect(again).toBe(first)
  })

  it("gives each instance its own child, all under the one root", async () => {
    const { create, records, Talker } = await loadFresh()

    const first = new Talker().exposed
    const second = new Talker().exposed
    first.info("one")
    second.info("two")

    expect(second).not.toBe(first)
    expect(create).toHaveBeenCalledTimes(1)
    expect(records.map(record => record.component)).toEqual(["Talker", "Talker"])
  })

  it("keeps level changes on one object from affecting the others", async () => {
    const { records, Talker, OtherTalker } = await loadFresh()
    const quieted = new Talker().exposed
    const untouched = new OtherTalker().exposed

    quieted.setLevel("silent")
    quieted.info("dropped")
    untouched.info("kept")

    expect(quieted.level).toBe("silent")
    expect(untouched.level).toBe("trace")
    expect(records.map(record => record.message)).toEqual(["kept"])
  })

  it("keeps implementation state private", async () => {
    const { Talker } = await loadFresh()
    const talker = new Talker()

    expect(talker.exposed).toBeDefined()

    expect(Reflect.ownKeys(talker)).toEqual([])
  })

  it("is inherited by every subclass but protected at compile time", async () => {
    const { Quiet } = await loadFresh()

    // @ts-expect-error log is protected, so it cannot be read from outside the class
    expect(new Quiet().log).toBeDefined()
  })
})
