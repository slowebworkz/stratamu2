import { BaseError } from "@/errors"
import type { BaseEventMap, LogLevel, LogLevelWithSilent } from "@repo/types"
import type { LevelChangeEventListener, LevelMapping, Logger } from "pino"
import pino from "pino"
import type { JsonValue, Jsonify, SetRequired, Simplify } from "type-fest"

import { isJsonValue, isObject, safeFormatPayload } from "@/utils"
import { SafeEmitter } from "@/events"
import type {
  Bindings,
  ChildLoggerOptions,
  PinoLogArgs,
  SafeMergingObject,
  ThrowConfig,
} from "@/events"

type ToJSONReturn = Jsonify<{
  level: LogLevelWithSilent
  bindings: Bindings
  childCount: number
}>

type ThrowLevel = Extract<LogLevel, "error" | "fatal">
type NonThrowLevel = Exclude<LogLevel, ThrowLevel>

type ThrowLogArgs = [
  obj: SetRequired<SafeMergingObject, "shouldThrow"> & ThrowConfig,
  msg?: string,
  ...rest: unknown[],
]
type NormalLogArgs = PinoLogArgs

type TypedLogger = Simplify<
  {
    [Level in ThrowLevel]: (...args: ThrowLogArgs) => void
  } & {
    [Level in NonThrowLevel]: (...args: NormalLogArgs) => void
  }
>

export abstract class LoggedEmitter<
  EventMap extends BaseEventMap<unknown[]>,
> extends SafeEmitter<EventMap> {
  // Map to store original → wrapped level change listeners for correct removal
  private _levelChangeWrappers = new WeakMap<LevelChangeEventListener, LevelChangeEventListener>()
  private _levelChangeKeys = new Set<LevelChangeEventListener>()
  private readonly _logger: Logger
  get log(): TypedLogger {
    const self = this
    return {
      error(...args: ThrowLogArgs) {
        logWithFormat(self._logger, "error", args)
      },
      fatal(...args: ThrowLogArgs) {
        logWithFormat(self._logger, "fatal", args)
      },
      warn(...args: NormalLogArgs) {
        logWithFormat(self._logger, "warn", args)
      },
      info(...args: NormalLogArgs) {
        logWithFormat(self._logger, "info", args)
      },
      debug(...args: NormalLogArgs) {
        logWithFormat(self._logger, "debug", args)
      },
      trace(...args: NormalLogArgs) {
        logWithFormat(self._logger, "trace", args)
      },
    }
  }
  private readonly _childLoggers: Set<LoggedEmitter<EventMap>> = new Set()

  /**
   * Clean up resources for controlled shutdowns.
   */
  public destroy(destroyChildren = true): void {
    if (destroyChildren) {
      for (const child of this._childLoggers) {
        child.destroy(false)
      }
    }
    this._childLoggers.clear()
    this._cleanupListeners()
    this.flush()
  }

  private _cleanupListeners(): void {
    cleanupLevelChangeListeners(this._logger, this._levelChangeKeys, this._levelChangeWrappers)
    this._levelChangeWrappers = new WeakMap()
  }

  constructor(logger?: Logger) {
    super()
    this._logger = logger ?? pino({ timestamp: pino.stdTimeFunctions.isoTime })
  }

  private _wrapLevelChangeListener(listener: LevelChangeEventListener): LevelChangeEventListener {
    return wrapLevelChangeListener(this._logger, listener)
  }

  toJSON(): ToJSONReturn {
    return {
      level: this.level,
      bindings: this.getBindings() as Record<string, JsonValue>,
      childCount: this._childLoggers.size,
    }
  }

  /**
   * Create a child logger with additional bindings.
   * Updates this instance's logger with additional context that will be included in all subsequent log messages.
   */
  /**
   * Create a child logger with additional bindings or options, matching pino's child signature.
   * @param bindingsOrOptions - Bindings object, or options object, or both
   * @param options - Optional options if first arg is bindings
   */
  createChildLogger(bindingsOrOptions: Bindings | ChildLoggerOptions): LoggedEmitter<EventMap> {
    // Always bind the child logger to the same EventMap as the parent
    const childLogger = this._logger.child(bindingsOrOptions as Bindings)
    const ctor = this.constructor as { new (logger?: Logger): LoggedEmitter<EventMap> }
    const childEmitter = new ctor(childLogger)
    this._childLoggers.add(childEmitter)
    return childEmitter
  }

  /**
   * Get the current log level of this logger.
   */
  get level(): LogLevelWithSilent {
    return this._logger.level as LogLevelWithSilent
  }

  /**
   * Set the log level for this logger.
   */
  set level(level: LogLevelWithSilent) {
    this._logger.level = level
  }

  /**
   * Check if a given log level is enabled.
   */
  isLevelEnabled(level: LogLevelWithSilent): boolean {
    return this._logger.isLevelEnabled(level)
  }

  /**
   * Get the numeric value of the current log level.
   * Useful for level comparisons and administration tools.
   */
  get levelValue(): number {
    return this._logger.levelVal
  }

  /**
   * Get the level mapping object containing all available levels and their numeric values.
   * Useful for dynamic level management in admin interfaces.
   */
  get levels(): LevelMapping["values"] {
    return this._logger.levels.values
  }

  /**
   * Get current bindings for this logger.
   */
  getBindings(): Bindings {
    return this._logger.bindings()
  }

  /**
   * Add or update bindings for this logger instance.
   */
  setBindings<T extends Bindings>(bindings: T): void {
    this._logger.setBindings(bindings)
  }

  /**
   * Flush any buffered log messages to destination.
   * Critical for ensuring logs are written before server shutdown or crashes.
   *
   * @param callback - Optional callback when flush completes
   */
  flush(callback?: (error?: Error) => void): void {
    this._logger.flush(callback)
  }

  /**
   * Add level change event listener.
   * Emitted when the logger's level is changed.
   */
  onLevelChange(listener: LevelChangeEventListener): void {
    if (typeof this._logger?.on === "function") {
      const wrapped = this._wrapLevelChangeListener(listener)
      this._levelChangeWrappers.set(listener, wrapped)
      this._levelChangeKeys.add(listener)
      this._logger.on("level-change", wrapped)
    }
  }

  /**
   * Remove level change event listener.
   */
  offLevelChange(listener: LevelChangeEventListener): void {
    if (typeof this._logger?.removeListener === "function") {
      const wrapped = this._levelChangeWrappers.get(listener)
      if (wrapped) {
        this._logger.removeListener("level-change", wrapped)
        this._levelChangeWrappers.delete(listener)
        this._levelChangeKeys.delete(listener)
      }
    }
  }
}

/**
 * Type guard to determine if args follow the object-first pattern.
 */
export function isObjectFirstArgs(
  args: PinoLogArgs,
): args is [obj: SafeMergingObject, msg?: string, ...args: unknown[]] {
  return args.length >= 1 && isObject(args[0])
}

export function hasThrowConfig(obj: SafeMergingObject): obj is SafeMergingObject & ThrowConfig {
  return isObject(obj) && "shouldThrow" in obj && (obj as ThrowConfig).shouldThrow === true
}

export function cleanupLevelChangeListeners(
  logger: Logger,
  keys: Set<LevelChangeEventListener>,
  wrappers: WeakMap<LevelChangeEventListener, LevelChangeEventListener>,
): void {
  if (typeof logger?.removeListener !== "function") return
  for (const orig of keys) {
    const wrapped = wrappers.get(orig)
    if (wrapped) logger.removeListener("level-change", wrapped)
  }
  keys.clear()
}

export function wrapLevelChangeListener(
  logger: Logger,
  listener: LevelChangeEventListener,
): LevelChangeEventListener {
  return (levelLabel, levelValue, previousLabel, previousLevelValue, instance) => {
    if (instance === logger) {
      listener(levelLabel, levelValue, previousLabel, previousLevelValue, instance)
    }
  }
}

export function shouldThrow(level: ThrowLevel, args: PinoLogArgs): void {
  if (!args.length || !isObject(args[0])) return

  const [obj, msg = "An error occurred"] = args

  const throwConfigObj = obj as ThrowConfig
  if (!throwConfigObj?.shouldThrow) return

  throw new BaseError(msg, { cause: obj instanceof Error ? obj : undefined })
}

export function formatLogArgs(args: unknown[]): unknown[] {
  return args.map(arg => (isJsonValue(arg) ? safeFormatPayload(arg) : arg))
}

export function logWithFormat<L extends LogLevel>(
  logger: Logger,
  level: L,
  args: L extends ThrowLevel ? ThrowLogArgs : NormalLogArgs,
): void {
  const formatted = formatLogArgs(args)
  // Use index signature to access the method safely
  ;(logger[level] as (...a: unknown[]) => void)(...formatted)
  shouldThrow(level as ThrowLevel, args as ThrowLogArgs)
}
