import { afterEach, describe, expect, it, vi } from "vitest"

interface LogRecord {
  level: string
  message?: string
  component?: string
  [key: string]: unknown
}

/** `attachTransport`'s bare-function form gets tslog's raw, positional-args "logObj", not the
 * shaped `{message, level, ...}` record `json.messageKey`/etc. describe -- that shape is only
 * what the formatted line carries, so a full transport parses it, the same `destination.write`
 * -> `JSON.parse` pattern the previous pino-backed test used. */
function capture() {
  const records: LogRecord[] = []
  const transport = {
    write(_record: unknown, line: string) {
      records.push(JSON.parse(line) as LogRecord)
    },
  }

  return { records, transport }
}

async function loadFresh() {
  vi.resetModules()

  const { TslogLogger } = await import("./tslog-logger.ts")
  const createReal = TslogLogger.create.bind(TslogLogger)
  const fallback = capture()
  const create = vi
    .spyOn(TslogLogger, "create")
    .mockImplementation(() => createReal({ type: "hidden", minLevel: "TRACE" }, fallback.transport))
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
      { component: "world", message: "loaded" },
      { component: "room", message: "entered" },
    ])
  })

  it("gives each call its own child logger", async () => {
    const { createContextLogger } = await loadFresh()

    expect(createContextLogger("same")).not.toBe(createContextLogger("same"))
  })

  it("uses the configured logger as the root, without creating a default", async () => {
    const { create, createReal, createContextLogger, fallback, setRootLogger } = await loadFresh()
    const configured = capture()

    setRootLogger(createReal({ type: "hidden", minLevel: "INFO" }, configured.transport))
    createContextLogger("engine").info("started")

    expect(create).not.toHaveBeenCalled()
    expect(fallback.records).toEqual([])
    expect(configured.records).toMatchObject([{ component: "engine", message: "started" }])
  })

  it("applies the configured logger's level to its context loggers", async () => {
    const { createReal, createContextLogger, setRootLogger } = await loadFresh()
    const configured = capture()

    setRootLogger(createReal({ type: "hidden", minLevel: "WARN" }, configured.transport))
    const log = createContextLogger("engine")
    log.info("dropped")
    log.warn("kept")

    expect(configured.records.map(record => record.message)).toEqual(["kept"])
  })

  it("leaves context loggers that already exist on the root they were created from", async () => {
    const { createReal, createContextLogger, fallback, setRootLogger } = await loadFresh()
    const configured = capture()

    const early = createContextLogger("early")
    setRootLogger(createReal({ type: "hidden", minLevel: "INFO" }, configured.transport))
    const late = createContextLogger("late")
    early.info("from early")
    late.info("from late")

    expect(fallback.records).toMatchObject([{ component: "early", message: "from early" }])
    expect(configured.records).toMatchObject([{ component: "late", message: "from late" }])
  })
})
