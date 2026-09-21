import { afterEach, describe, expect, it, vi } from "vitest"

interface LogRecord {
  level: number
  msg?: string
  component?: string
  [key: string]: unknown
}

function capture() {
  const records: LogRecord[] = []
  const destination = {
    write(chunk: string) {
      records.push(JSON.parse(chunk) as LogRecord)
    },
  }

  return { records, destination }
}

async function loadFresh() {
  vi.resetModules()

  const { PinoLogger } = await import("./pino-logger.ts")
  const createReal = PinoLogger.create.bind(PinoLogger)
  const fallback = capture()
  const create = vi
    .spyOn(PinoLogger, "create")
    .mockImplementation(() => createReal({ level: "trace" }, fallback.destination))
  const { createContextLogger, setRootLogger } = await import("./root-logger.ts")

  return { create, createReal, createContextLogger, fallback, setRootLogger }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("root logger", () => {
  it("creates the default root lazily, once, for every context logger", async () => {
    const { create, createContextLogger } = await loadFresh()

    expect(create).not.toHaveBeenCalled()

    createContextLogger("first")
    createContextLogger("second")

    expect(create).toHaveBeenCalledTimes(1)
  })

  it("binds the component on every record of a context logger", async () => {
    const { createContextLogger, fallback } = await loadFresh()

    createContextLogger("world").info("loaded")
    createContextLogger("room").info("entered")

    expect(fallback.records).toMatchObject([
      { component: "world", msg: "loaded" },
      { component: "room", msg: "entered" },
    ])
  })

  it("gives each call its own child logger", async () => {
    const { createContextLogger } = await loadFresh()

    expect(createContextLogger("same")).not.toBe(createContextLogger("same"))
  })

  it("uses the configured logger as the root, without creating a default", async () => {
    const { create, createReal, createContextLogger, fallback, setRootLogger } = await loadFresh()
    const configured = capture()

    setRootLogger(createReal({ level: "info" }, configured.destination))
    createContextLogger("engine").info("started")

    expect(create).not.toHaveBeenCalled()
    expect(fallback.records).toEqual([])
    expect(configured.records).toMatchObject([{ component: "engine", msg: "started" }])
  })

  it("applies the configured logger's level to its context loggers", async () => {
    const { createReal, createContextLogger, setRootLogger } = await loadFresh()
    const configured = capture()

    setRootLogger(createReal({ level: "warn" }, configured.destination))
    const log = createContextLogger("engine")
    log.info("dropped")
    log.warn("kept")

    expect(configured.records.map(record => record.msg)).toEqual(["kept"])
  })

  it("leaves context loggers that already exist on the root they were created from", async () => {
    const { createReal, createContextLogger, fallback, setRootLogger } = await loadFresh()
    const configured = capture()

    const early = createContextLogger("early")
    setRootLogger(createReal({ level: "info" }, configured.destination))
    const late = createContextLogger("late")
    early.info("from early")
    late.info("from late")

    expect(fallback.records).toMatchObject([{ component: "early", msg: "from early" }])
    expect(configured.records).toMatchObject([{ component: "late", msg: "from late" }])
  })
})
