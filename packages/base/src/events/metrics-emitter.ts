import { FilteredPriorityEmitter } from './filtered-priority-emitter.js'
// Static import for Node.js perf_hooks
import { perfNow } from '@/performance'
import { EventMetrics } from './event-metrics.js'

import type { BaseEventMap } from '@repo/types'
import type { Exact } from 'type-fest'

import type { OmnipresentEventData, UnsubscribeFunction } from 'emittery'
import type {
  Bindings,
  ChildLoggerOptions,
  Count,
  DatalessEventNames,
  ErrorCount,
  EventName,
  ListenerName,
  MetricsEmitterEvents,
  TimeInMs,
} from './types.js'

/**
 * MetricsEmitter extends FilteredPriorityEmitter to add comprehensive per-event metrics.
 *
 * ## Features:
 * - **Event metrics tracking**: Tracks emission count, total/last time, and slowest listener per event
 * - **High-precision timing**: Wraps listeners to time their execution with microsecond precision
 * - **Comprehensive reporting**: Provides getEventMetrics() for detailed performance analysis
 * - **Error tracking**: Separately tracks successful emissions vs errors
 * - **Built-in reset**: resetMetrics event for clearing metrics (protected listener cannot be removed)
 * - **Priority & filtering**: Inherits advanced listener management from FilteredPriorityEmitter
 * - **Structured logging**: Full pino integration from LoggedEmitter base class
 *
 * ## Usage Example:
 * ```typescript
 * const emitter = new MetricsEmitter<{
 *   playerMove: { x: number, y: number }
 *   gameEvent: { type: string, data: any }
 * }>()
 *
 * // Add listeners with priority and filtering
 * emitter.onWithOptions('playerMove', handleMove, { priority: 10 })
 *
 * // Emit events (automatically tracked)
 * await emitter.emit('playerMove', { x: 10, y: 20 })
 *
 * // Analyze performance
 * const metrics = emitter.getEventMetrics()
 * console.log(metrics.find(m => m.event === 'playerMove')?.averageTimeMs)
 * ```
 *
 * @template EventMap - The event map for this emitter, constrained to proper event structure
 */
export class MetricsEmitter<
  EventMap extends BaseEventMap<any[]> = BaseEventMap<unknown[]>,
> extends FilteredPriorityEmitter<EventMap & MetricsEmitterEvents> {
  // =============================================================================
  // Private Properties
  // =============================================================================

  /**
   * Protected listener for the built-in resetMetrics event.
   * Uses a stable reference to allow protection in off() method.
   */
  private _resetListener = ([eventName]: [string?]) => {
    this._resetMetrics(eventName)
  }

  /**
   * Map of event name to emission count.
   */
  private _eventCounts: Map<string, Count> = new Map()

  /**
   * Map of event name to total time spent in listeners.
   */
  private _eventTotalTime: Map<string, TimeInMs> = new Map()

  /**
   * Map of event name to last emission time.
   */
  private _eventLastTime: Map<string, TimeInMs> = new Map()

  /**
   * Map of event name to slowest listener/time.
   */
  private _eventSlowest: Map<string, { time: TimeInMs; listener: ListenerName }> = new Map()

  /**
   * Map of event name to error count.
   */
  private _eventErrors: Map<string, ErrorCount> = new Map()

  /**
   * Set up the protected reset listener that cannot be removed by users.
   */
  private _setupProtectedResetListener() {
    super.on('resetMetrics', this._resetListener)
  }

  /**
   * Record the slowest listener for an event.
   * @param event Event name.
   * @param listener Listener function.
   * @param elapsed Time in ms.
   */
  private _recordListenerTime(event: string, listener: (...args: any[]) => any, elapsed: number) {
    const prev = this._eventSlowest.get(event)
    if (!prev || elapsed > prev.time) {
      this._eventSlowest.set(event, {
        time: elapsed as TimeInMs,
        listener: (listener.name || '<anonymous>') as ListenerName,
      })
    }
  }

  /**
   * Reset all metrics, or metrics for a specific event.
   * @param event Optional event name to reset.
   */
  private _resetMetrics(event?: string) {
    // Collect all metric maps for consistent operations
    const metricMaps = [
      this._eventCounts,
      this._eventTotalTime,
      this._eventLastTime,
      this._eventSlowest,
      this._eventErrors,
    ]

    // Single loop with conditional operation
    metricMaps.forEach((map) => {
      if (event) {
        map.delete(event)
      } else {
        map.clear()
      }
    })
  }

  // =============================================================================
  // Constructor
  // =============================================================================

  constructor() {
    super()
    this._setupProtectedResetListener()
  }

  // =============================================================================
  // Public Methods
  // =============================================================================

  /**
   * Create a child logger with additional bindings.
   * Returns a new MetricsEmitter instance with the child logger configured.
   *
   * @param bindings - Key-value pairs to include in all log messages
   * @param options - Optional child logger configuration
   * @returns A new MetricsEmitter instance with the child logger
   */
  createChildLogger<T extends Bindings>(
    bindings: Exact<T, Bindings>,
    options?: Exact<ChildLoggerOptions, ChildLoggerOptions>,
  ): this {
    const childEmitter = new MetricsEmitter<EventMap>() as this
    this._initializeChildLogger(childEmitter, bindings, options)
    return childEmitter
  }

  /**
   * Get metrics for all events as type-safe EventMetrics class instances.
   * @returns Array of EventMetrics objects with branded types and computed properties
   */
  getEventMetrics(): EventMetrics[] {
    const metrics: EventMetrics[] = []

    // Get all unique event names from all maps
    const allEvents = new Set([
      ...this._eventCounts.keys(),
      ...this._eventTotalTime.keys(),
      ...this._eventErrors.keys(),
    ])

    for (const event of allEvents) {
      const count = this._eventCounts.get(event) ?? (0 as Count)
      const totalTime = this._eventTotalTime.get(event) ?? (0 as TimeInMs)
      const lastTime = this._eventLastTime.get(event) ?? (0 as TimeInMs)
      const slowest = this._eventSlowest.get(event)
      const errorCount = this._eventErrors.get(event) ?? (0 as ErrorCount)

      try {
        // Create EventMetrics class instance with branded types
        metrics.push(
          new EventMetrics(
            event as EventName,
            count,
            totalTime,
            lastTime,
            slowest?.listener ?? ('' as ListenerName),
            slowest?.time ?? (0 as TimeInMs),
            errorCount,
          ),
        )
      } catch (error) {
        // Destructure error properties with defaults in one line
        const { message = String(error), name: errorType = 'Unknown' } =
          error instanceof Error ? error : {}

        // Use structured logging with focused context
        this.log.error(
          {
            event,
            errorType,
          },
          message,
        )
        // Continue processing other events instead of failing completely
        continue
      }
    }
    return metrics
  }

  /**
   * Emit an event with no payload (dataless event).
   * @param eventName The event name.
   */
  async emit<EventName extends DatalessEventNames<EventMap>>(eventName: EventName): Promise<void>
  /**
   * Emit an event with a payload.
   * @param eventName The event name.
   * @param eventData The event payload.
   */
  async emit<EventName extends keyof EventMap>(
    eventName: EventName,
    eventData: EventMap[EventName],
  ): Promise<void>
  /**
   * Emit an event (overload for optional payload).
   * @param eventName The event name.
   * @param eventData The event payload (optional).
   */
  async emit<EventName extends keyof EventMap>(
    eventName: EventName,
    eventData?: EventMap[EventName],
  ): Promise<void> {
    const start = perfNow()
    let error: unknown = undefined
    try {
      if (arguments.length === 1) {
        await super.emit(eventName as any)
      } else {
        await super.emit(eventName as any, eventData as any)
      }
    } catch (err) {
      error = err
    }
    const elapsed = perfNow() - start
    if (!error) {
      this._eventCounts.set(
        eventName as string,
        ((this._eventCounts.get(eventName as string) || 0) + 1) as Count,
      )
    } else {
      // Track errors
      this._eventErrors.set(
        eventName as string,
        ((this._eventErrors.get(eventName as string) || 0) + 1) as ErrorCount,
      )
    }
    this._eventTotalTime.set(
      eventName as string,
      ((this._eventTotalTime.get(eventName as string) || 0) + elapsed) as TimeInMs,
    )
    this._eventLastTime.set(eventName as string, elapsed as TimeInMs)
    if (error) throw error
  }

  /**
   * Override on() to wrap listeners for timing and error tracking.
   *
   * @param eventName The event name or array of names.
   * @param listener The listener function.
   * @param options Optional: { signal } for abortable listeners.
   * @returns Unsubscribe function.
   */
  on<EventName extends keyof (EventMap & MetricsEmitterEvents) | keyof OmnipresentEventData>(
    eventName: EventName | readonly EventName[],
    listener: (
      eventData: (EventMap & MetricsEmitterEvents & OmnipresentEventData)[EventName],
    ) => void | Promise<void>,
    options?: { signal?: AbortSignal },
  ): UnsubscribeFunction {
    const wrapped = async (
      eventData: (EventMap & MetricsEmitterEvents & OmnipresentEventData)[EventName],
    ) => {
      const start = perfNow()
      let error: unknown = undefined
      try {
        await listener(eventData)
      } catch (err) {
        if (error === undefined) error = err
      }
      const elapsed = perfNow() - start
      if (Array.isArray(eventName)) {
        for (const e of eventName) {
          this._recordListenerTime(e as string, listener, elapsed)
        }
      } else {
        this._recordListenerTime(eventName as string, listener, elapsed)
      }
      if (error !== undefined) throw error
    }
    return super.on(eventName, wrapped, options)
  }

  /**
   * Override off() to protect the built-in resetMetrics listener from being removed.
   * Silently ignores attempts to remove the protected listener while allowing
   * user listeners on resetMetrics to be removed normally.
   *
   * @param eventName The event name to remove listeners from.
   * @param listener The specific listener to remove.
   */
  off<EventName extends keyof (EventMap & MetricsEmitterEvents) | keyof OmnipresentEventData>(
    eventName: EventName | readonly EventName[],
    listener: (
      eventData: (EventMap & MetricsEmitterEvents & OmnipresentEventData)[EventName],
    ) => void | Promise<void>,
  ): void {
    if (eventName === 'resetMetrics' && listener === this._resetListener) {
      // Silently ignore attempts to remove the protected listener
      return
    }
    return super.off(eventName, listener)
  }
}
