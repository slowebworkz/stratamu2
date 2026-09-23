import type { ISettingsParam, Transport, TransportFn } from "tslog"
import { Logger, LogLevel as TslogLevel } from "tslog"

import { SENSITIVE_KEYS } from "./constants.ts"
import type { ActiveLogLevel, LogArgs, LogBindings, LoggingCapability, LogLevel } from "./types.ts"

type LooseLevelMethod = (...args: unknown[]) => unknown

/** One past `FATAL`, tslog's highest default level: a `minLevel` this high lets nothing through,
 * the same outcome `LoggingCapability`'s `"silent"` names. tslog has no level of that name itself. */
const SILENT_MIN_LEVEL = TslogLevel.FATAL + 1

function toTslogName(level: ActiveLogLevel): Uppercase<ActiveLogLevel> {
  return level.toUpperCase() as Uppercase<ActiveLogLevel>
}

/**
 * The `LoggingCapability` contract (see `types.ts` for the semantics this implements), backed by
 * `tslog` -- chosen for zero runtime dependencies and native support for most of that contract
 * as-is: levels, child loggers, structured JSON output, and key-based redaction at any depth.
 *
 * Two of `LoggingCapability`'s semantics are not tslog's own default, so this class enforces them
 * itself, on top of tslog's primitives, rather than deferring to whatever tslog happens to do:
 * tslog's own bindings lose to a call's same-named field, the reverse of what a logger's identity
 * needs; and tslog only recognizes an `Error` passed as the sole argument or as an extra argument
 * after a string message, not one found as a property's value inside a fields object -- which it
 * silently drops instead of serializing. Neither is a defect in tslog; both are simply not the
 * semantic this contract chose. See `#protectBindings` and `normalizeErrors` below.
 */
export class TslogLogger implements LoggingCapability {
  readonly #logger: Logger<unknown>

  constructor(logger: Logger<unknown>) {
    this.#logger = logger
  }

  static create(
    settings: ISettingsParam<unknown> = {},
    transport?: Transport<unknown> | TransportFn<unknown>,
  ): TslogLogger {
    const logger = new Logger({
      type: "json",
      mask: { keys: [...SENSITIVE_KEYS] },
      json: { numericLevel: false },
      ...settings,
    })
    if (transport) {
      logger.attachTransport(transport)
    }
    return new TslogLogger(logger)
  }

  get level(): LogLevel {
    const id = this.#logger.settings.minLevel
    if (id >= SILENT_MIN_LEVEL) {
      return "silent"
    }
    // Reverse lookup of a numeric enum: undefined only for an id nothing here ever sets (this
    // class only ever writes one of TslogLevel's own ids, or SILENT_MIN_LEVEL, handled above).
    const name = TslogLevel[id]
    return name === undefined ? "trace" : (name.toLowerCase() as LogLevel)
  }

  setLevel(level: LogLevel): void {
    this.#logger.setMinLevel(level === "silent" ? SILENT_MIN_LEVEL : toTslogName(level))
  }

  isLevelEnabled(level: ActiveLogLevel): boolean {
    return this.#logger.isLevelEnabled(toTslogName(level))
  }

  trace(...args: LogArgs): void {
    this.#write("trace", args)
  }

  debug(...args: LogArgs): void {
    this.#write("debug", args)
  }

  info(...args: LogArgs): void {
    this.#write("info", args)
  }

  warn(...args: LogArgs): void {
    this.#write("warn", args)
  }

  error(...args: LogArgs): void {
    this.#write("error", args)
  }

  fatal(...args: LogArgs): void {
    this.#write("fatal", args)
  }

  child(bindings: LogBindings): LoggingCapability {
    return new TslogLogger(this.#logger.getSubLogger({ bindings }))
  }

  flush(): Promise<void> {
    return this.#logger.flush()
  }

  #write(level: ActiveLogLevel, args: LogArgs): void {
    const normalized = this.#protectBindings(normalizeErrors(args))
    ;(this.#logger[level] as LooseLevelMethod)(...normalized)
  }

  // A binding identifies who is logging; a log call's own fields are what it is logging about --
  // different namespaces, and identity wins when they collide. tslog's own default is the other
  // way around ("always lose to per-call fields on a collision", by its own docs), so this
  // enforces the chosen semantic on top of it.
  #protectBindings(args: LogArgs): LogArgs {
    const [context, ...rest] = args
    if (!isPlainContext(context)) {
      return args
    }
    const bound = this.#logger.settings.bindings
    const boundKeys = bound === undefined ? [] : Object.keys(bound)
    if (!Object.keys(context).some(key => boundKeys.includes(key))) {
      return args
    }
    const kept = Object.fromEntries(
      Object.entries(context).filter(([key]) => !boundKeys.includes(key)),
    )
    return [kept, ...rest] as LogArgs
  }
}

function isPlainContext(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Error) &&
    !Array.isArray(value)
  )
}

interface SerializedError {
  readonly name: string
  readonly message: string
  readonly stack: string | undefined
}

function serializeError(error: Error): SerializedError {
  return { name: error.name, message: error.message, stack: error.stack }
}

/**
 * An Error is never silently lost, wherever it appears in what was logged -- the semantic
 * `types.ts` chose, since a logging capability that can drop the one piece of information
 * explaining a failure is worse than none. tslog's own detection covers only two of the shapes
 * this needs (an Error alone, or as an extra argument after a string message) and, notably, not
 * an Error found as a property's value inside a fields object: it drops that value entirely,
 * serializing neither it nor anything in its place. That is exactly how the one real caller in
 * this codebase logs one today (`Runtime`: `log.error({ err: error, task }, "Task failed")`), so
 * this normalizes both remaining shapes itself, ahead of ever calling into tslog:
 *
 *   error alone, or as the context object -> `{ error: <serialized> }`
 *   a field whose value is an Error, anywhere in a fields object -> that field, serialized
 *
 * A string first argument (`log.error("message", err)`) is untouched: tslog already serializes
 * that shape correctly on its own.
 */
function normalizeErrors(args: LogArgs): LogArgs {
  const [first, ...rest] = args
  if (first instanceof Error) {
    return [{ error: serializeError(first) }, ...rest] as LogArgs
  }
  if (isPlainContext(first)) {
    let changed = false
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(first)) {
      if (value instanceof Error) {
        mapped[key] = serializeError(value)
        changed = true
      } else {
        mapped[key] = value
      }
    }
    if (changed) {
      return [mapped, ...rest] as LogArgs
    }
  }
  return args
}
