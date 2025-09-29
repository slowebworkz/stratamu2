import Emittery from 'emittery'
import type { LevelMapping, Logger } from 'pino'
import pino from 'pino'
import type { Exact } from 'type-fest'

import type { Args, BaseEventMap } from '@repo/types'
import type { OmnipresentEventData, UnsubscribeFunction } from 'emittery'
import { hasThrowConfig, isObjectFirstArgs } from './logged-emitter.js'
import type {
  Bindings,
  ChildLoggerOptions,
  EmitteryOncePromise,
  LevelChangeEventListener,
  LogLevel,
  LogLevelWithSilent,
  LoggerOptions,
  PinoLogArgs,
} from './types.js'
import { LOGGER_LEVELS } from './types.js'

// =============================================================================
// Private Event Types
// =============================================================================

/**
 * Internal events used by SafeEmitter for private operations.
 */
type SafeEmitterPrivateEvents = {
  resetErrorCounts: [eventName?: string]
  clearSafetyLogs: [eventName?: string]
  enableSafeMode: [enabled: boolean]
}

/**
 * Combined event map with private events.
 */
type SafeEmitterEvents<T extends BaseEventMap> = T & SafeEmitterPrivateEvents

// =============================================================================
// Class Definition
// =============================================================================

/**
 * Event emitter with safe emission that prevents system crashes from listener errors.
 *
 * Extends Emittery directly and provides:
 * - Safe emission with comprehensive error handling
 * - Full logging capabilities from pino
 * - Private event system for internal operations
 * - Error tracking and reset capabilities
 *
 * Wraps all emits in try/catch and routes errors to customizable handler.
 * Useful for game engines or servers where single listener errors shouldn't crash the process.
 *
 * @template EventMap - The event map for this emitter
 */
export abstract class SafeEmitter<
  /**
   * Stub for metrics integration. Returns empty array by default.
   * Override in subclasses or mix with MetricsEmitter for real metrics.
   */
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends Emittery<SafeEmitterEvents<EventMap>> {
  // =============================================================================
  // Logging Properties (from LoggedEmitter)
  // =============================================================================

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

  // =============================================================================
  // Private Event System
  // =============================================================================

  /**
   * Array of private event names that should not be exposed to external users.
   * These events are used for internal operations and safety management.
   */
  private static readonly PRIVATE_EVENTS: ReadonlyArray<keyof SafeEmitterPrivateEvents> = [
    'resetErrorCounts',
    'clearSafetyLogs',
    'enableSafeMode',
  ] as const

  /**
   * Private listeners for internal operations.
   */
  private _privateListeners = {
    resetErrorCounts: ([eventName]: [string?]) => {
      this._resetErrorCounts(eventName)
    },
    clearSafetyLogs: ([eventName]: [string?]) => {
      this._clearSafetyLogs(eventName)
    },
    enableSafeMode: ([enabled]: [boolean]) => {
      this._safetyEnabled = enabled
    },
  }

  // =============================================================================
  // Safety Properties
  // =============================================================================

  /**
   * Map of event names to error counts for tracking safety metrics.
   */
  private _errorCounts: Map<string, number> = new Map()

  /**
   * Map of event names to safety logs for debugging.
   */
  private _safetyLogs: Map<string, Array<{ timestamp: number; error: unknown; listener: string }>> =
    new Map()

  /**
   * Whether safety mode is enabled (can be toggled via private event).
   */
  private _safetyEnabled = true

  // =============================================================================
  // Constructor
  // =============================================================================

  /**
   * Construct a SafeEmitter with optional pino logger configuration.
   *
   * @param loggerOptions - Optional pino logger configuration
   */
  constructor(loggerOptions?: Exact<LoggerOptions, LoggerOptions>) {
    super()

    // Initialize logger (from LoggedEmitter)
    this.logger = pino({
      timestamp: pino.stdTimeFunctions.isoTime,
      ...loggerOptions,
    })

    // Initialize log methods using LOGGER_LEVELS
    this.log = {} as typeof this.log
    for (const level of LOGGER_LEVELS) {
      this.log[level] = (...args: PinoLogArgs) => {
        this.logger[level](...(args as Parameters<Logger[typeof level]>))
        if (args.length >= 1) {
          this._shouldThrow(level, ...args)
        }
      }
    }

    // Set up private event listeners
    this._setupPrivateListeners()
  }

  /**
   * Stub for metrics integration. Returns empty array by default.
   * Override in subclasses or mix with MetricsEmitter for real metrics.
   */
  getEventMetrics(): any[] {
    return []
  }

  // =============================================================================
  // Private Event Setup
  // =============================================================================

  /**
   * Set up protected listeners for private events.
   */
  private _setupPrivateListeners(): void {
    // Set up each private event listener
    super.on('resetErrorCounts', this._privateListeners.resetErrorCounts)
    super.on('clearSafetyLogs', this._privateListeners.clearSafetyLogs)
    super.on('enableSafeMode', this._privateListeners.enableSafeMode)
  }

  // =============================================================================
  // Private Safety Methods
  // =============================================================================

  /**
   * Reset error counts for all events or a specific event.
   */
  private _resetErrorCounts(eventName?: string): void {
    if (eventName) {
      this._errorCounts.delete(eventName)
    } else {
      this._errorCounts.clear()
    }
  }

  /**
   * Clear safety logs for all events or a specific event.
   */
  private _clearSafetyLogs(eventName?: string): void {
    if (eventName) {
      this._safetyLogs.delete(eventName)
    } else {
      this._safetyLogs.clear()
    }
  }

  /**
   * Record a listener error for safety tracking.
   */
  private _recordListenerError(eventName: string, error: unknown, listener: string): void {
    // Update error count
    const currentCount = this._errorCounts.get(eventName) || 0
    this._errorCounts.set(eventName, currentCount + 1)

    // Add to safety logs
    if (!this._safetyLogs.has(eventName)) {
      this._safetyLogs.set(eventName, [])
    }
    this._safetyLogs.get(eventName)!.push({
      timestamp: Date.now(),
      error,
      listener,
    })
  }

  // =============================================================================
  // Logging Methods (from LoggedEmitter)
  // =============================================================================

  /**
   * Create a child logger with additional bindings.
   */
  createChildLogger<T extends Bindings>(
    bindings: Exact<T, Bindings>,
    options?: Exact<ChildLoggerOptions, ChildLoggerOptions>,
  ): this {
    this.logger = this.logger.child(bindings, options)

    // Reinitialize log methods with the child logger
    for (const level of LOGGER_LEVELS) {
      this.log[level] = (...args: PinoLogArgs) => {
        this.logger[level](...(args as Parameters<Logger[typeof level]>))
        if (args.length >= 1) {
          this._shouldThrow(level, ...args)
        }
      }
    }

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
   */
  get levelValue(): number {
    return this.logger.levelVal
  }

  /**
   * Get the level mapping object containing all available levels and their numeric values.
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
   */
  setBindings<T extends Bindings>(bindings: Exact<T, Bindings>): void {
    this.logger.setBindings(bindings)
  }

  /**
   * Flush any buffered log messages to destination.
   */
  flush(callback?: (error?: Error) => void): void {
    this.logger.flush(callback)
  }

  /**
   * Add level change event listener.
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
   */
  private _shouldThrow(level: LogLevel, ...args: PinoLogArgs): void {
    if (level !== 'error' && level !== 'fatal') {
      return
    }

    if (isObjectFirstArgs(args)) {
      const [mergingObject, errorMessage] = args

      if (hasThrowConfig(mergingObject)) {
        const ErrorClass = mergingObject.ErrorClass ?? Error
        const message = typeof errorMessage === 'string' ? errorMessage : 'An error occurred'
        throw new ErrorClass(message)
      }
    }
  }

  // =============================================================================
  // Safe Event Methods
  // =============================================================================

  /**
   * Customizable error handler for listener errors.
   * Override this method to implement custom error handling logic.
   */
  protected onListenerError(
    eventName: keyof EventMap,
    error: unknown,
    context: {
      type: 'on' | 'once'
      listener?: (...args: any[]) => any
      hasFilter?: boolean
    },
  ): void {
    this._recordListenerError(String(eventName), error, context.listener?.name || '<anonymous>')

    this.log.error(
      {
        event: String(eventName),
        listenerType: context.type,
        listenerName: context.listener?.name || '<anonymous>',
        hasFilter: context.hasFilter,
        error,
      },
      `SafeEmitter caught ${context.type} listener error`,
    )
  }
  /**
   * Add listener with individual error wrapping for isolation.
   *
   * @param eventName The event name or array of names
   * @param listener The listener function
   * @param options Optional signal for abortable listeners
   * @returns Unsubscribe function
   */
  on<Name extends keyof SafeEmitterEvents<EventMap> | keyof OmnipresentEventData>(
    eventName: Name | readonly Name[],
    listener: (
      eventData: (SafeEmitterEvents<EventMap> & OmnipresentEventData)[Name],
    ) => void | Promise<void>,
    options?: { signal?: AbortSignal },
  ): UnsubscribeFunction {
    const safeListener = async (
      eventData: (SafeEmitterEvents<EventMap> & OmnipresentEventData)[Name],
    ) => {
      try {
        await listener(eventData)
      } catch (error) {
        // Get the actual event name for error reporting
        const actualEventName = Array.isArray(eventName) ? eventName[0] : eventName
        this.onListenerError(actualEventName as keyof EventMap, error, {
          type: 'on',
          listener,
        })
      }
    }
    return super.on(eventName, safeListener, options)
  }

  /**
   * Add one-time listener with error isolation.
   * Returns EmitteryOncePromise with error handling built in.
   *
   * @param eventName The event name
   * @param filter Optional filter predicate
   * @returns Promise-like object with .off() method for cancellation
   */
  once<Name extends keyof SafeEmitterEvents<EventMap> | keyof OmnipresentEventData>(
    eventName: Name,
    filter?: (eventData: (SafeEmitterEvents<EventMap> & OmnipresentEventData)[Name]) => boolean,
  ): EmitteryOncePromise<(SafeEmitterEvents<EventMap> & OmnipresentEventData)[Name]> {
    const originalPromise = super.once(eventName, filter)

    // Create a wrapped promise that preserves .off() method and adds error handling
    const wrappedPromise = originalPromise.catch((error) => {
      this.onListenerError(eventName as keyof EventMap, error, {
        type: 'once',
        hasFilter: !!filter,
      })
      // Re-throw to maintain promise chain behavior
      throw error
    }) as EmitteryOncePromise<(SafeEmitterEvents<EventMap> & OmnipresentEventData)[Name]>

    // Preserve the .off() method for cancellation
    wrappedPromise.off = originalPromise.off.bind(originalPromise)

    return wrappedPromise
  }

  /**
   * Emit an event safely with error handling.
   *
   * @param eventName The event name
   * @param args Arguments for the event
   */
  async emitSafe<EventName extends keyof EventMap>(
    eventName: EventName,
    ...args: Args<EventMap[EventName]>
  ): Promise<void> {
    try {
      if (args.length === 0) {
        await super.emit(eventName as any)
      } else {
        // Handle multiple arguments by passing them through
        await (super.emit as any)(eventName, ...args)
      }
    } catch (err) {
      this.onEmitError(eventName, err)
    }
  }

  /**
   * Error handler for emit failures. Can be overridden in subclasses.
   *
   * @param eventName The event name
   * @param error The error thrown by a listener
   */
  protected onEmitError<EventName extends keyof EventMap>(
    eventName: EventName,
    error: unknown,
  ): void {
    this.log.error({ event: String(eventName), error }, 'SafeEmitter caught an error during emit')
  }
}
