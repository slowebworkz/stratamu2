import type { LOG_LEVELS } from "./constants.ts"

export type ActiveLogLevel = (typeof LOG_LEVELS)[number]

export type LogLevel = ActiveLogLevel | "silent"

export type LogBindings = Record<string, unknown>

export type LogArgs =
  | [message: string, ...values: unknown[]]
  | [context: object, message?: string, ...values: unknown[]]

export interface LoggingCapability {
  readonly level: LogLevel
  setLevel(level: LogLevel): void
  isLevelEnabled(level: ActiveLogLevel): boolean

  trace(...args: LogArgs): void
  debug(...args: LogArgs): void
  info(...args: LogArgs): void
  warn(...args: LogArgs): void
  error(...args: LogArgs): void
  fatal(...args: LogArgs): void

  /**
   * Creates a logger whose records carry `bindings`. A logger's bindings identify it, so a field
   * with the same name in a log call does not override them.
   */
  child(bindings: LogBindings): LoggingCapability
  flush(): Promise<void>
}
