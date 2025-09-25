import type { Args } from '@repo/types'
import type {
  Bindings,
  ChildLoggerOptions,
  Level,
  LevelChangeEventListener,
  LevelOrString,
  LevelWithSilent,
  LogDescriptor,
  LogEvent,
  LogFn,
  LoggerOptions,
  SerializerFn,
} from 'pino'
import type { IntRange, LiteralUnion, ReadonlyDeep, Simplify, Tagged } from 'type-fest'

// =============================================================================
// SafeEmitter Types
// =============================================================================

/**
 * EmitteryOncePromise type - Promise with .off() cancellation method.
 * Re-exported from emittery for convenience.
 */
export type { EmitteryOncePromise } from 'emittery'

// =============================================================================
// LoggedEmitter Types
// =============================================================================

/**
 * Common logger levels for pino and proxies.
 * Uses pino's native Level type for consistency.
 */
export const LOGGER_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const

/**
 * Event priority levels for better organization.
 * Higher numbers execute first.
 */
export const EVENT_PRIORITIES = {
  CRITICAL: 1000 as Priority,
  HIGH: 100 as Priority,
  NORMAL: 0 as Priority,
  LOW: -100 as Priority,
  BACKGROUND: -1000 as Priority,
} as const

/**
 * Common event patterns for standardized event naming.
 */
export const EVENT_PATTERNS = {
  LIFECYCLE: /^(init|start|stop|destroy)$/,
  USER_ACTION: /^user\./,
  SYSTEM_EVENT: /^system\./,
  ERROR_EVENT: /^error\./,
  METRIC_EVENT: /^metric\./,
} as const

/**
 * Default timeout values for various operations.
 */
export const DEFAULT_TIMEOUTS = {
  LISTENER_TIMEOUT_MS: 5000 as TimeInMs,
  EMIT_TIMEOUT_MS: 10000 as TimeInMs,
  CLEANUP_TIMEOUT_MS: 1000 as TimeInMs,
} as const

/**
 * LogLevel uses pino's native Level type for better compatibility.
 * Includes: "trace" | "debug" | "info" | "warn" | "error" | "fatal"
 */
export type LogLevel = Level

/**
 * Extended log level type including "silent" for complete level control.
 */
export type LogLevelWithSilent = LevelWithSilent

/**
 * Log level type allowing custom string extensions.
 */
export type LogLevelOrString = LevelOrString

// Re-export useful pino types for LoggedEmitter consumers
export type {
  Bindings,
  ChildLoggerOptions,
  LevelChangeEventListener,
  LogDescriptor,
  LogEvent,
  LogFn,
  LoggerOptions,
  SerializerFn,
}

/**
 * Precise parameter types for pino log methods.
 * Based on LogFn interface overloads, supports:
 * 1. Message-first: (msg: string, ...args: unknown[])
 * 2. Object-first: (obj: Record<string, any>, msg?: string, ...args: unknown[])
 *
 * Enhanced with type-fest for maximum type safety.
 */
type MessageFirstArgs = readonly [msg: string, ...args: readonly unknown[]]
type ObjectFirstArgs = readonly [obj: Record<string, unknown>, msg?: string, ...args: readonly unknown[]]

export type PinoLogArgs = Simplify<MessageFirstArgs | ObjectFirstArgs>

/**
 * Immutable bindings type for safer binding operations.
 */
export type SafeBindings = ReadonlyDeep<Bindings>

/**
 * Type-safe shouldThrow configuration in merging objects.
 */
export type ThrowConfig = Simplify<{
  readonly shouldThrow: true
  readonly ErrorClass?: new (message: string) => Error
}>

/**
 * Enhanced merging object with type-safe throw configuration.
 */
export type SafeMergingObject = Simplify<Record<string, unknown> & Partial<ThrowConfig>>

// =============================================================================
// EventMetrics Types
// =============================================================================

/**
 * Branded types for better type safety and domain modeling.
 * Using type-fest's Tagged utility for nominal typing.
 */
export type EventName = Tagged<string, 'EventName'>
export type TimeInMs = Tagged<number, 'TimeInMs'>
export type Count = Tagged<number, 'Count'>
export type EfficiencyRatio = Tagged<number, 'EfficiencyRatio'>
export type ErrorCount = Tagged<number, 'ErrorCount'>
export type EstimatedBytes = Tagged<number, 'Bytes'>
export type Priority = Tagged<number, 'Priority'>
export type ListenerId = Tagged<string, 'ListenerId'>
export type SchemaVersion = Tagged<string, 'SchemaVersion'>

/**
 * Valid listener names - either a function name or the anonymous marker.
 */
export type ListenerName = LiteralUnion<'<anonymous>', string>

/**
 * Efficiency threshold values with reasonable constraints.
 */
export type EfficiencyThreshold = IntRange<1, 10>

// =============================================================================
// MetricsEmitter Types
// =============================================================================

/**
 * Built-in events for MetricsEmitter.
 */
export type MetricsEmitterEvents = {
  resetMetrics: [eventName?: string]
}

/**
 * PositiveNumber branded type for MetricsEmitter internal use.
 */
export type PositiveNumber = Tagged<number, 'PositiveNumber'>

/**
 * DatalessEventNames<EventMap> extracts event names that have no payload arguments.
 * Uses mapped types to filter events where Args<EventMap[K]> resolves to an empty tuple.
 * Uses strict readonly [] check to prevent edge cases with Args resolution.
 */
export type DatalessEventNames<EventMap> = {
  [K in keyof EventMap]: Args<EventMap[K]> extends readonly [] ? K : never
}[keyof EventMap]

/**
 * Internal listener performance record using type-fest for type safety.
 */
export type ListenerPerformanceRecord = Simplify<
  ReadonlyDeep<{
    time: number
    listener: ListenerId
  }>
>

// =============================================================================
// FilteredPriorityEmitter Types
// =============================================================================

/**
 * Callback function signature for event listeners.
 * Can be synchronous or asynchronous.
 *
 * @template EventMap - The event map defining event names and their data types
 * @template EventName - The specific event name being handled
 */
export type ListenerCallback<EventMap, EventName extends keyof EventMap> = (
  ...args: Args<EventMap[EventName]>
) => void | Promise<void>

/**
 * Filter function signature for conditional event handling.
 * Returns `true` to allow the listener to execute, `false` to skip it.
 *
 * @template EventMap - The event map defining event names and their data types
 * @template EventName - The specific event name being handled
 */
export type ListenerFilter<EventMap, EventName extends keyof EventMap> = (
  ...args: Args<EventMap[EventName]>
) => boolean

/**
 * Options for registering priority listeners.
 * Uses type-fest's Simplify for cleaner type display.
 *
 * @template EventMap - The event map defining event names and their data types
 * @template EventName - The specific event name being handled
 */
export type PriorityListenerOptions<EventMap, EventName extends keyof EventMap> = Simplify<{
  /** Priority level (default: 0). Higher numbers execute first */
  priority?: Priority
  /** Optional filter function. Return true to execute, false to skip */
  filter?: ListenerFilter<EventMap, EventName>
}>

/**
 * Unsubscribe function returned by listener registration methods.
 * Calling this function removes the listener from the emitter.
 */
export type UnsubscribeFunction = () => void

/**
 * Configuration object for a priority listener.
 * Uses type-fest's Simplify to flatten the interface for better IDE display.
 *
 * @template EventMap - The event map defining event names and their data types
 * @template EventName - The specific event name being handled
 */
export type PriorityListener<EventMap, EventName extends keyof EventMap> = Simplify<{
  /** The function to call when the event is emitted */
  callback: ListenerCallback<EventMap, EventName>
  /** Priority level (higher numbers run first) */
  priority: Priority
  /** Optional filter to conditionally execute the callback */
  filter?: ListenerFilter<EventMap, EventName>
}>

// =============================================================================
// Event Handler Context Types
// =============================================================================

/**
 * Context information for listener error handling.
 * Provides detailed information about failed listeners for debugging and monitoring.
 * Read-only to prevent mutation of error context data.
 */
type ListenerErrorContextCore = {
  /** Type of listener that failed */
  type: 'on' | 'once'
  /** The actual listener function (for 'on' type) */
  listener?: ListenerCallback<any, any>
  /** Whether a filter was applied (for 'once' type) */
  hasFilter?: boolean
  /** Additional context properties */
  [key: string]: unknown
}

export type ListenerErrorContext = ImmutableSimplified<ListenerErrorContextCore>

/**
 * Execution context for event emissions.
 * Tracks timing and performance information during event processing.
 * Read-only to ensure immutability of execution snapshots.
 */
type EmissionContextCore<EventName = string> = {
  /** Name of the event being emitted */
  eventName: EventName
  /** Timestamp when emission started */
  startTime: TimeInMs
  /** Number of listeners that will be called */
  listenerCount: Count
  /** Whether this is a priority emission */
  isPriorityEmission?: boolean
  /** Stack trace for debugging (optional) */
  stackTrace?: string
}

export type EmissionContext<EventName = string> = ImmutableSimplified<EmissionContextCore<EventName>>

/**
 * Event validation result for type-safe event handling.
 * Provides compile-time and runtime validation information.
 * Generic T represents the Args<EventMap[EventName]> tuple type.
 * Read-only to prevent mutation of validation results.
 */
type ValidationResultCore<T extends readonly unknown[]> = {
  /** Whether the event data is valid */
  isValid: boolean
  /** Validation error message if invalid */
  error?: string
  /** The validated event arguments as a tuple */
  data?: T
  /** Schema version used for validation */
  schemaVersion?: SchemaVersion
}

export type EventValidationResult<T extends readonly unknown[] = readonly unknown[]> = ImmutableSimplified<
  ValidationResultCore<T>
>

// =============================================================================
// Advanced Event Utilities
// =============================================================================

/**
 * Event middleware function for pre/post processing.
 * Allows transformation and validation of events before emission.
 * Uses the same argument signature as ListenerCallback for consistency.
 */
export type EventMiddleware<EventMap, EventName extends keyof EventMap = keyof EventMap> = (
  eventName: EventName,
  next: () => Promise<void>,
  ...args: Args<EventMap[EventName]>
) => Promise<void>

/**
 * Event subscription configuration with advanced options.
 * Extends basic listener options with middleware and validation.
 */
type AdvancedListenerExtensions<EventMap, EventName extends keyof EventMap> = {
  /** Middleware to apply before listener execution */
  middleware?: EventMiddleware<EventMap, EventName>[]
  /** Validate event data before calling listener */
  validate?: (...args: Args<EventMap[EventName]>) => EventValidationResult<Args<EventMap[EventName]>>
  /** Maximum number of times this listener can be called */
  maxCalls?: Count
  /** Timeout in milliseconds for listener execution */
  timeoutMs?: TimeInMs
}

export type AdvancedListenerOptions<EventMap, EventName extends keyof EventMap> = Simplify<
  PriorityListenerOptions<EventMap, EventName> & AdvancedListenerExtensions<EventMap, EventName>
>

/**
 * Event metrics aggregation utilities.
 * Provides statistical analysis across multiple events.
 * Read-only to ensure immutability of computed statistics.
 */
type EventMetricsCore = {
  /** Total number of events across all types */
  totalEvents: Count
  /** Total execution time across all events */
  totalTimeMs: TimeInMs
  /** Average time per event */
  averageTimeMs: TimeInMs
  /** Events with performance concerns */
  concerningEvents: EventName[]
  /** Most frequently emitted event */
  mostFrequentEvent?: EventName
  /** Slowest event on average */
  slowestEvent?: EventName
  /** Total error count across all events */
  totalErrors: ErrorCount
  /** Events with the highest error rates */
  errorProneEvents: EventName[]
}

export type EventMetricsAggregation = ImmutableSimplified<EventMetricsCore>

// =============================================================================
// Type Guards and Utilities
// =============================================================================

/**
 * Base constraint for event maps - ensures all events have argument arrays.
 */
export type AnyEventMap = Record<string, unknown[]>

/**
 * Common event patterns that most emitters support.
 */
export type CommonEventMap = {
  error: [Error]
  ready: []
  destroy: []
}

/**
 * Helper to create event maps that extend common patterns.
 */
export type EventMapWithCommon<T extends AnyEventMap> = T & CommonEventMap

/**
 * Utility type for immutable, simplified objects.
 * Combines Simplify and ReadonlyDeep for common pattern.
 */
export type ImmutableSimplified<T> = Simplify<ReadonlyDeep<T>>

/**
 * Helper type to safely cast event arguments for parent emission in bubbling scenarios.
 * Reduces the need for repeated unknown casts throughout bubbling logic.
 *
 * @template EventMap - The child event map
 * @template ParentEventMap - The parent event map (must include all EventMap keys)
 * @template EventName - The specific event name being bubbled
 */
export type ArgsForParent<
  EventMap extends AnyEventMap,
  ParentEventMap extends AnyEventMap,
  EventName extends keyof EventMap
> = Args<ParentEventMap[EventName & keyof ParentEventMap]>

/**
 * Type guard to check if an event has data payload.
 * Useful for conditional emission logic.
 * Uses strict readonly [] check to prevent edge cases with Args resolution.
 */
export type HasEventData<EventMap, EventName extends keyof EventMap> =
  Args<EventMap[EventName]> extends readonly [] ? false : true

/**
 * Extract event names that have specific argument patterns.
 * More flexible than DatalessEventNames for complex filtering.
 * Uses strict readonly checks for better Args type resolution.
 */
export type EventsWithArgs<EventMap, ArgsPattern extends readonly unknown[]> = {
  [K in keyof EventMap]: Args<EventMap[K]> extends ArgsPattern ? K : never
}[keyof EventMap]

/**
 * Event listener state tracking.
 * Useful for debugging and monitoring listener lifecycle.
 */
export type ListenerState = 'registered' | 'active' | 'paused' | 'errored' | 'unsubscribed'

/**
 * Metadata for listener tracking and debugging.
 * Reusable across different listener management contexts.
 */
export type UnsubscribeMeta = {
  /** Current state of the listener */
  readonly state: ListenerState
  /** Number of times this listener has been called */
  readonly callCount: Count
  /** Last error (if any) from this listener */
  readonly lastError?: Error | unknown
}

/**
 * Enhanced unsubscribe function with state information.
 * Provides more context about listener removal through composable metadata.
 */
export type EnhancedUnsubscribeFunction = UnsubscribeFunction & UnsubscribeMeta

/**
 * Event emitter performance profile.
 * Comprehensive performance analysis for optimization.
 * All data is read-only to prevent accidental mutations of the snapshot.
 */
type MemoryUsageStats = {
  /** Number of active listeners */
  activeListeners: Count
  /** Number of registered events */
  registeredEvents: Count
  /** Estimated memory footprint in bytes */
  estimatedBytes: EstimatedBytes
}

type EmitterConfiguration = {
  /** Whether metrics collection is enabled */
  metricsEnabled: boolean
  /** Whether error isolation is active */
  errorIsolationEnabled: boolean
  /** Log level for this emitter */
  logLevel: LogLevel
}

type EmitterPerformanceCore = {
  /** Emitter instance identifier */
  emitterId: string
  /** Total runtime since creation */
  uptimeMs: TimeInMs
  /** Memory usage statistics */
  memoryUsage: MemoryUsageStats
  /** Performance metrics aggregation */
  metrics: EventMetricsAggregation
  /** Configuration snapshot */
  configuration: EmitterConfiguration
}

export type EmitterPerformanceProfile = ImmutableSimplified<EmitterPerformanceCore>
