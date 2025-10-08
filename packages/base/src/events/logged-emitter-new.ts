import type { LevelMapping, Logger } from 'pino'
import pino from 'pino'
import type { Exact } from 'type-fest'
import { SafeEmitter } from './safe-emitter-new.js'

import type { BaseEventMap } from '@repo/types'
import isPlainObject from 'is-plain-object'
import type {
  Bindings,
  ChildLoggerOptions,
  LevelChangeEventListener,
  LogLevel,
  LogLevelWithSilent,
  PinoLogArgs,
  SafeEmitterEventMap,
  SafeMergingObject,
  ThrowConfig,
} from './types.js'
import { LOGGER_LEVELS } from './types.js'

/**
 * LoggedEmitterNew extends SafeEmitter to add logging capabilities.
 * Replace usages of legacy LoggedEmitter with this class for improved type safety and event logging.
 */
export abstract class LoggedEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends SafeEmitter<SafeEmitterEventMap<EventMap>> {
  /**
   * The pino logger instance used for all logging.
   */
  protected logger!: Logger

  /**
   * Proxy object for all log levels (trace, debug, info, warn, error, fatal).
   * Uses precise pino LogFn parameter types for better type safety.
   */
  public readonly log!: {
    [Level in LogLevel]: (...args: PinoLogArgs) => void
  }

  /**
   * Construct a LoggedEmitter with optional pino logger configuration.
   * Enhanced with exact type matching for safer configuration.
   *
   * @param loggerOptions - Optional pino logger configuration
   */
  constructor() {
    super()
    this.logger = pino({
      timestamp: pino.stdTimeFunctions.isoTime,
      // Add other defaults here if needed
    })
    this.log = {} as typeof this.log
    this._setupLogProxy()
  }

  /**
   * Create a child logger with additional bindings.
   * Updates this instance's logger with additional context that will be included in all subsequent log messages.
   *
   * @param bindings - Key-value pairs to include in all log messages
   * @param options - Optional child logger configuration
   * @returns This instance with the updated child logger
   */
  createChildLogger<T extends Bindings>(
    bindings: Exact<T, Bindings>,
    options?: Exact<ChildLoggerOptions, ChildLoggerOptions>,
  ): this {
    // Create child logger and update this instance
    this.logger = this.logger.child(bindings, options)

    // Reinitialize log methods with the child logger
    this._setupLogProxy()

    return this
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
   * Reinitialize log methods to use the current logger instance.
   * Call this after updating the logger (e.g., in createChildLogger).
   */
  private _setupLogProxy() {
    for (const level of LOGGER_LEVELS) {
      this.log[level] = (...args: PinoLogArgs) => {
        this.logger[level](...(args as Parameters<Logger[typeof level]>))
        if (args.length >= 1) {
          this._shouldThrow(level, ...args)
        }
      }
    }
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
export function isObjectFirstArgs(
  args: PinoLogArgs,
): args is readonly [obj: SafeMergingObject, msg?: string, ...args: readonly unknown[]] {
  return args.length >= 1 && args[0] !== null && isPlainObject(args[0])
}

/**
 * Type-safe check for shouldThrow configuration in merging objects.
 * Uses exact type matching for maximum safety.
 */
export function hasThrowConfig(obj: SafeMergingObject): obj is SafeMergingObject & ThrowConfig {
  return obj.shouldThrow === true
}
