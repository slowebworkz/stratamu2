import type { LOG_LEVELS } from "./constants.ts"

/**
 * Stratamu's own logging semantics -- what this contract means, decided on its own terms rather
 * than inherited from whatever library happens to implement it (`TslogLogger` today):
 *
 * - **Bindings win over call-site fields.** A binding (`child`) identifies *who* is logging --
 *   the component, the subsystem, the instance -- and that identity must not be spoofable by
 *   *what* is logged. A field on a particular log call with the same name as a binding is
 *   dropped, not merged over it. (The underlying library's own default is the other way around;
 *   this contract's own semantics do not follow it.)
 * - **An Error is never silently lost.** Wherever one appears in what is logged -- as the entire
 *   payload, or as a named field inside a larger structured one -- it is captured and serialized
 *   to at least `{ name, message, stack }`. A logging capability that can silently drop the one
 *   piece of information explaining a failure is worse than no structured logging at all, and
 *   this is the primary way this engine expects to learn *why* a task or an operation failed.
 * - **Structured data passes through as given.** The point of taking a context object alongside
 *   a message is queryable, machine-parseable fields (a player id, a task kind), not just a
 *   human-readable string.
 * - **Sensitive fields are redacted by default, at any depth**, not only at the top level or one
 *   level of nesting: `password`, `token`, `secret`, `authorization`, wherever they occur.
 */

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
   * Creates a logger whose records carry `bindings`, merged with (and, on a name collision,
   * winning over) whatever an individual log call on it provides -- see this file's semantics.
   */
  child(bindings: LogBindings): LoggingCapability
  flush(): Promise<void>
}
