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
import type {
  ConditionalKeys,
  IntRange,
  LiteralUnion,
  ReadonlyDeep,
  Simplify,
  Tagged,
} from 'type-fest'

// =============================================================================
// LoggedEmitter Types
// =============================================================================

/**
 * Common logger levels for pino and proxies.
 * Uses pino's native Level type for consistency.
 */
export const LOGGER_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const

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

/**
 * Valid listener names - either a function name or the anonymous marker.
 */
export type ListenerName = LiteralUnion<'<anonymous>', string>

/**
 * Efficiency threshold values with reasonable constraints.
 */
export type EfficiencyThreshold = IntRange<1, 10>

/**
 * Error count tracking for failed emissions.
 */
export type ErrorCount = Tagged<number, 'ErrorCount'>

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
 * DatalessEventNames<EventMap> uses type-fest utilities for robust detection of events with no payload.
 * Leverages Args<T> and conditional key filtering to find events that resolve to empty argument arrays.
 * This approach is more maintainable and leverages proven type-fest utilities for type safety.
 */
export type DatalessEventNames<EventMap> = ConditionalKeys<
  {
    [K in keyof EventMap]: Args<EventMap[K]> extends [] ? true : false
  },
  true
>

/**
 * Internal listener performance record using type-fest for type safety.
 */
export type ListenerPerformanceRecord = Simplify<
  ReadonlyDeep<{
    time: number
    listener: string
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
  priority?: number
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
  priority: number
  /** Optional filter to conditionally execute the callback */
  filter?: ListenerFilter<EventMap, EventName>
}>
