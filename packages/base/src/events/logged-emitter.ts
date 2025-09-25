import Emittery from 'emittery'
import type { LevelMapping, Logger } from 'pino'
import pino from 'pino'
import type { Exact, ReadonlyDeep, Simplify } from 'type-fest'

import type { BaseEventMap } from '@repo/types'
import isPlainObject from 'is-plain-object'
import type {
  Bindings,
  ChildLoggerOptions,
  LevelChangeEventListener,
  LogLevel,
  LogLevelWithSilent,
  LoggerOptions,
} from './types.js'
import { LOGGER_LEVELS } from './types.js'

// =============================================================================
// Types
// =============================================================================

/**
 * Precise parameter types for pino log methods.
 * Based on LogFn interface overloads, supports:
 * 1. Message-first: (msg: string, ...args: unknown[])
 * 2. Object-first: (obj: Record<string, any>, msg?: string, ...args: unknown[])
 *
 * Enhanced with type-fest for maximum type safety.
 */
type PinoLogArgs = Simplify<
  | readonly [msg: string, ...args: readonly unknown[]]
  | readonly [obj: Record<string, any>, msg?: string, ...args: readonly unknown[]]
>

/**
 * Immutable bindings type for safer binding operations.
 */
type SafeBindings = ReadonlyDeep<Bindings>

/**
 * Type-safe shouldThrow configuration in merging objects.
 */
type ThrowConfig = Simplify<{
  readonly shouldThrow: true
  readonly ErrorClass?: new (message: string) => Error
}>

/**
 * Enhanced merging object with type-safe throw configuration.
 */
type SafeMergingObject = Simplify<Record<string, unknown> & Partial<ThrowConfig>>

// =============================================================================
// Class Definition
// =============================================================================

/**
 * Abstract LoggedEmitter extends Emittery to add structured logging via pino.
 *
 * ## Features:
 * - Per-instance pino logger with configurable options
 * - Log proxy for all pino levels (trace, debug, info, warn, error, fatal)
 * - Throw-capable logging for error and fatal levels via shouldThrow flag
 * - Type-safe bindings and child logger creation
 * - Level change event support
 *
 * @template EventMap - The event map for this emitter.
 */
export abstract class LoggedEmitter<
  EventMap extends BaseEventMap<any> = BaseEventMap,
> extends Emittery<EventMap> {
  /**
   * The pino logger instance used for all logging.
   */
  protected logger: Logger

  /**
   * Proxy object for all log levels (trace, debug, info, warn, error, fatal).
   * Uses precise pino LogFn parameter types for better type safety.
   */
  public readonly log: {
    [Level in LogLevel]: (...args: PinoLogArgs) => void
  }

  /**
   * Construct a LoggedEmitter with optional pino logger configuration.
   * Enhanced with exact type matching for safer configuration.
   *
   * @param loggerOptions - Optional pino logger configuration
   */
  constructor(loggerOptions?: Exact<LoggerOptions, LoggerOptions>) {
    super()

    this.logger = pino({
      timestamp: pino.stdTimeFunctions.isoTime,
      ...loggerOptions,
    })

    // Initialize log methods using LOGGER_LEVELS
    this.log = {} as typeof this.log
    for (const level of LOGGER_LEVELS) {
      this.log[level] = (...args: PinoLogArgs) => {
        // Cast args to Parameters<Logger[typeof level]> for pino compatibility
        this.logger[level](...(args as Parameters<Logger[typeof level]>))
        if (args.length >= 1) {
          this._shouldThrow(level, ...args)
        }
      }
    }
  }

  /**
   * Create a child logger with additional bindings.
   * Useful for adding context to all log messages from this instance.
   * Enhanced with type-safe bindings and exact parameter matching.
   *
   * Note: This method must be implemented by concrete subclasses since
   * LoggedEmitter is abstract and cannot be instantiated directly.
   *
   * @param bindings - Key-value pairs to include in all log messages
   * @param options - Optional child logger configuration
   * @returns A new instance of the concrete class with the child logger
   */
  abstract createChildLogger<T extends Bindings>(
    bindings: Exact<T, Bindings>,
    options?: Exact<ChildLoggerOptions, ChildLoggerOptions>,
  ): this

  /**
   * Protected helper method for concrete classes to implement createChildLogger.
   * Creates a child logger and reinitializes the log methods.
   *
   * @param childInstance - The concrete instance to configure
   * @param bindings - Key-value pairs to include in all log messages
   * @param options - Optional child logger configuration
   */
  protected _initializeChildLogger<T extends Bindings>(
    childInstance: this,
    bindings: Exact<T, Bindings>,
    options?: Exact<ChildLoggerOptions, ChildLoggerOptions>,
  ): void {
    childInstance.logger = this.logger.child(bindings, options)

    // Reinitialize log methods with the child logger
    for (const level of LOGGER_LEVELS) {
      childInstance.log[level] = (...args: PinoLogArgs) => {
        // Cast args to Parameters<Logger[typeof level]> for pino compatibility
        childInstance.logger[level](...(args as Parameters<Logger[typeof level]>))
        if (args.length >= 1) {
          childInstance._shouldThrow(level, ...args)
        }
      }
    }
  }

  /**
   * Get the current log level of this logger.
   */
  get level(): LogLevelWithSilent {
    return this.logger.level as LogLevelWithSilent
  }

  /**
   * Set the log level for this logger.
   */
  set level(level: LogLevelWithSilent) {
    this.logger.level = level
  }

  /**
   * Check if a given log level is enabled.
   */
  isLevelEnabled(level: LogLevelWithSilent): boolean {
    return this.logger.isLevelEnabled(level)
  }

  /**
   * Get the numeric value of the current log level.
   * Useful for level comparisons and administration tools.
   */
  get levelValue(): number {
    return this.logger.levelVal
  }

  /**
   * Get the level mapping object containing all available levels and their numeric values.
   * Useful for dynamic level management in admin interfaces.
   */
  get levels(): LevelMapping['values'] {
    return this.logger.levels.values
  }

  /**
   * Get current bindings for this logger.
   */
  getBindings(): Bindings {
    return this.logger.bindings()
  }

  /**
   * Add or update bindings for this logger instance.
   * Useful for updating player context during gameplay (e.g., room changes, state updates).
   * Note: Does not overwrite existing bindings - can result in duplicate keys.
   * Enhanced with exact type matching for safer binding updates.
   *
   * @param bindings - Key-value pairs to add to log lines as properties
   */
  setBindings<T extends Bindings>(bindings: Exact<T, Bindings>): void {
    this.logger.setBindings(bindings)
  }

  /**
   * Flush any buffered log messages to destination.
   * Critical for ensuring logs are written before server shutdown or crashes.
   *
   * @param callback - Optional callback when flush completes
   */
  flush(callback?: (error?: Error) => void): void {
    this.logger.flush(callback)
  }

  /**
   * Add level change event listener.
   * Emitted when the logger's level is changed.
   */
  onLevelChange(listener: LevelChangeEventListener): void {
    this.logger.on('level-change', listener)
  }

  /**
   * Remove level change event listener.
   */
  offLevelChange(listener: LevelChangeEventListener): void {
    this.logger.removeListener('level-change', listener)
  }

  /**
   * Check if an error should be thrown based on the merging object and log level.
   * Only throws for 'error' and 'fatal' levels when shouldThrow flag is present.
   * Enhanced with type-safe guards and immutable pattern matching.
   *
   * @param level - The log level being used
   * @param args - The typed arguments passed to the log method
   */
  private _shouldThrow(level: LogLevel, ...args: PinoLogArgs): void {
    // Only error and fatal levels can throw
    if (level !== 'error' && level !== 'fatal') {
      return
    }

    // Check for object-first signature: [obj, msg?, ...args]
    if (isObjectFirstArgs(args)) {
      const [mergingObject, errorMessage] = args

      if (hasThrowConfig(mergingObject)) {
        // Type-safe extraction of error details
        const ErrorClass = mergingObject.ErrorClass ?? Error
        const message = typeof errorMessage === 'string' ? errorMessage : 'An error occurred'

        throw new ErrorClass(message)
      }
    }
    // Note: Message-first signature [msg, ...args] doesn't support shouldThrow
    // as there's no merging object to contain the flag
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Type guard to determine if args follow the object-first pattern.
 * Uses isPlainObject for more accurate plain object detection.
 * Enhanced with type-fest for safer type narrowing.
 */
function isObjectFirstArgs(
  args: PinoLogArgs,
): args is readonly [obj: SafeMergingObject, msg?: string, ...args: readonly unknown[]] {
  return args.length >= 1 && args[0] !== null && isPlainObject(args[0])
}

/**
 * Type guard to determine if args follow the message-first pattern.
 * Enhanced with readonly tuple for immutability.
 */
function isMessageFirstArgs(
  args: PinoLogArgs,
): args is readonly [msg: string, ...args: readonly unknown[]] {
  return args.length >= 1 && typeof args[0] === 'string'
}

/**
 * Type-safe check for shouldThrow configuration in merging objects.
 * Uses exact type matching for maximum safety.
 */
function hasThrowConfig(obj: SafeMergingObject): obj is SafeMergingObject & ThrowConfig {
  return obj.shouldThrow === true
}
