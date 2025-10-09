import type { BaseEventMap } from '@repo/types'
import isPlainObject from 'is-plain-object'
import type { LevelMapping, Logger } from 'pino'
import pino from 'pino'
import { SafeEmitter } from './safe-emitter-3.js'
import type {
  Bindings,
  ChildLoggerOptions,
  LevelChangeEventListener,
  LogLevel,
  LogLevelWithSilent,
  PinoLogArgs,
  SafeMergingObject,
  ThrowConfig,
} from './types.js'
import { LOGGER_LEVELS } from './types.js'

/**
 * LoggedEmitter: Extends SafeEmitter to add structured logging for all event operations.
 *
 * INTERNAL USE ONLY: This class is intended for server-side diagnostics, monitoring, and debugging.
 * It should not be exposed to game clients or players.
 *
 * @template EventMap extends BaseEventMap<unknown[]>
 */
export class LoggedEmitter<EventMap extends BaseEventMap<unknown[]>> extends SafeEmitter<EventMap> {
  private readonly _logger: Logger
  public readonly log: {
    [Level in LogLevel]: (...args: PinoLogArgs) => void
  }
  private readonly _childLoggers: Set<LoggedEmitter<EventMap>> = new Set()

  constructor(logger?: Logger) {
    super()
    this._logger = logger ?? pino({ timestamp: pino.stdTimeFunctions.isoTime })
    this.log = {} as typeof this.log
    for (const level of LOGGER_LEVELS) {
      this.log[level] = (...args: PinoLogArgs) => {
        this._logger[level](...(args as Parameters<Logger[typeof level]>))
        if (args.length >= 1) {
          this._shouldThrow(level, ...args)
        }
      }
    }
  }

  /**
   * Create a child logger with additional bindings.
   * Updates this instance's logger with additional context that will be included in all subsequent log messages.
   */
  createChildLogger<T extends Bindings>(bindings: T, options?: ChildLoggerOptions): this {
    const childLogger = this._logger.child(bindings, options)
    const childEmitter = new (this.constructor as any)(childLogger)
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
  get levels(): LevelMapping['values'] {
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
    if (typeof this._logger?.on === 'function') {
      const wrappedListener = (
        levelLabel: string,
        levelValue: number,
        previousLevelLabel: string,
        previousLevelValue: number,
        instance: any,
      ) => {
        if (instance !== this._logger) return
        listener(levelLabel, levelValue, previousLevelLabel, previousLevelValue, instance)
      }
      this._logger.on('level-change', wrappedListener)
    }
  }

  /**
   * Remove level change event listener.
   */
  offLevelChange(listener: LevelChangeEventListener): void {
    if (typeof this._logger?.removeListener === 'function') {
      this._logger.removeListener('level-change', listener)
    }
  }

  /**
   * Check if an error should be thrown based on the merging object and log level.
   * Only throws for 'error' and 'fatal' levels when shouldThrow flag is present.
   */
  private _shouldThrow(level: LogLevel, ...args: PinoLogArgs): void {
    if (level !== 'error' && level !== 'fatal') return
    if (isObjectFirstArgs(args)) {
      const [mergingObject, errorMessage] = args
      if (hasThrowConfig(mergingObject)) {
        const ErrorClass = (mergingObject as any).ErrorClass ?? Error
        const message = typeof errorMessage === 'string' ? errorMessage : 'An error occurred'
        throw new ErrorClass(message)
      }
    }
  }
}

/**
 * Type guard to determine if args follow the object-first pattern.
 */
export function isObjectFirstArgs(
  args: PinoLogArgs,
): args is readonly [obj: SafeMergingObject, msg?: string, ...args: readonly unknown[]] {
  return args.length >= 1 && isPlainObject(args[0])
}

/**
 * Type-safe check for shouldThrow configuration in merging objects.
 */
export function hasThrowConfig(obj: SafeMergingObject): obj is SafeMergingObject & ThrowConfig {
  return (obj as any).shouldThrow === true
}
