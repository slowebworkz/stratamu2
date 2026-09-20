import type { DestinationStream, Logger, LoggerOptions } from "pino"
import { pino } from "pino"

import { DEFAULT_REDACT_PATHS } from "./constants.ts"
import type { ActiveLogLevel, LogArgs, LogBindings, LoggingCapability, LogLevel } from "./types.ts"

type LooseWrite = (...args: unknown[]) => void

export class PinoLogger implements LoggingCapability {
  readonly #logger: Logger

  constructor(logger: Logger) {
    this.#logger = logger
  }

  static create(options: LoggerOptions = {}, destination?: DestinationStream): PinoLogger {
    return new PinoLogger(
      pino(
        {
          timestamp: pino.stdTimeFunctions.isoTime,
          redact: [...DEFAULT_REDACT_PATHS],
          ...options,
        },
        destination,
      ),
    )
  }

  get level(): LogLevel {
    return this.#logger.level as LogLevel
  }

  setLevel(level: LogLevel): void {
    this.#logger.level = level
  }

  isLevelEnabled(level: ActiveLogLevel): boolean {
    return this.#logger.isLevelEnabled(level)
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
    return new PinoLogger(this.#logger.child(bindings))
  }

  flush(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#logger.flush(error => (error ? reject(error) : resolve()))
    })
  }

  // pino replaces its level methods whenever the level changes, so the method is looked up on every call.
  #write(level: ActiveLogLevel, args: LogArgs): void {
    ;(this.#logger[level] as LooseWrite).apply(this.#logger, args)
  }
}
