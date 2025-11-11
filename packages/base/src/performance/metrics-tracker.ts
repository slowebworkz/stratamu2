import { isInternalEvent } from '@/events/private-events.js'
import type { EventKey } from '@/events/types.js'
import { perfNow } from '@/performance/perf-now.js'
import type { Count, ErrorCount, ListenerName, TimeInMs } from '@/performance/types.js'
import type { Awaitable, BaseEventMap } from '@repo/types'

// Type-safe listener for a given event key (single argument, matches SafeEmitter)
type ListenerForEvent<T, K extends keyof T> = (data: T[K]) => Awaitable<void>

// Control events for metrics management
export type ControlEvents = {
  resetMetrics: void
}

// Unified metrics object for each event
export type EventMetrics = {
  count: Count
  totalTime: TimeInMs
  lastTime: TimeInMs
  errorCount: ErrorCount
  slowest?: { time: TimeInMs; listener: ListenerName }
}

// Immutable tuple of control event keys, always in sync with ControlEvents type
export const CONTROL_EVENTS = ['resetMetrics'] as const
const CONTROL_EVENT_SET: ReadonlySet<EventKey<ControlEvents>> = new Set(CONTROL_EVENTS)

/**
 * MetricsTracker: Composes with any event emitter to track performance metrics
 * for all events without mutating the emitter's methods.
 */
export class MetricsTracker<EventMap extends BaseEventMap<unknown[]>> {
  private readonly emitter: {
    on: <K extends keyof EventMap>(event: K, listener: ListenerForEvent<EventMap, K>) => void
    off: <K extends keyof EventMap>(event: K, listener: ListenerForEvent<EventMap, K>) => void
  }

  /** Unified metrics map for each event. */
  private readonly _eventMetrics: Map<EventKey<EventMap>, EventMetrics> = new Map()

  constructor(emitter: Pick<MetricsTracker<EventMap>['emitter'], 'on' | 'off'>) {
    this.emitter = emitter
  }

  /**
   * Returns a listener function wrapped with metrics tracking for the given event.
   * Use this helper when registering listeners with the emitter.
   */
  public trackListener<K extends keyof EventMap, E = unknown>(
    event: K,
    listener: ListenerForEvent<EventMap, K>,
  ) {
    const tracker = this
    return async function (data: EventMap[K]) {
      const start = perfNow()
      let error: E | undefined = undefined
      try {
        await listener(data)
      } catch (err) {
        error = err as E
      }
      const elapsed = perfNow() - start
      // Don't track metrics for control events or internal events
      if (!CONTROL_EVENT_SET.has(event as string) && !isInternalEvent(event)) {
        const metricsData =
          tracker._eventMetrics.get(event as EventKey<EventMap>) ?? createEmptyMetrics()
        updateMetrics<E>(metricsData, elapsed, error, listener)
        tracker._eventMetrics.set(event as EventKey<EventMap>, metricsData)
      }
      if (error) throw error
    }
  }

  /**
   * Reset all metrics, or metrics for a specific event.
   */
  public resetMetrics(event?: EventKey<EventMap>) {
    event ? this._eventMetrics.delete(event) : this._eventMetrics.clear()
  }

  /**
   * Get metrics for all tracked events as an array (EventMetrics-like).
   */
  public getEventMetricsArray() {
    return Array.from(this._eventMetrics.entries(), ([event, data]) =>
      normalizeMetrics(event, data),
    )
  }

  /**
   * Get metrics for all tracked events as a record (legacy API).
   */
  public getEventMetrics() {
    const metrics: Record<string, ReturnType<typeof normalizeMetrics>> = {}
    for (const [event, data] of this._eventMetrics.entries()) {
      metrics[normalizeEventKey(event)] = normalizeMetrics(event, data)
    }
    return metrics
  }

  /**
   * Get metrics for a specific event.
   */
  public getMetricsForEvent(event: EventKey<EventMap>) {
    const metrics = this._eventMetrics.get(event)
    return metrics ? Object.freeze({ ...metrics }) : undefined
  }
}

// Helper functions to brand numbers as tagged types
function toCount(n: number): Count {
  return n as Count
}

function toTimeInMs(n: number): TimeInMs {
  return n as TimeInMs
}

function toErrorCount(n: number): ErrorCount {
  return n as ErrorCount
}

function toListenerName(s: string): ListenerName {
  return s as ListenerName
}

function createEmptyMetrics(): EventMetrics {
  return {
    count: toCount(0),
    totalTime: toTimeInMs(0),
    lastTime: toTimeInMs(0),
    errorCount: toErrorCount(0),
  }
}

function updateMetrics<E = unknown>(
  metrics: ReturnType<typeof createEmptyMetrics>,
  elapsed: number,
  error: E | undefined,
  listener: Function,
) {
  metrics.count = toCount(metrics.count + (error ? 0 : 1))
  metrics.errorCount = toErrorCount(metrics.errorCount + (error ? 1 : 0))
  metrics.totalTime = toTimeInMs(metrics.totalTime + elapsed)
  metrics.lastTime = toTimeInMs(elapsed)
  const prev = metrics.slowest
  if (!prev || elapsed > prev.time) {
    metrics.slowest = {
      time: toTimeInMs(elapsed),
      listener: toListenerName(listener.name || '<anonymous>'),
    }
  }
}

function normalizeEventKey(event: unknown): string {
  return String(event)
}

// Helper to normalize metrics for output
function normalizeMetrics(event: unknown, data: EventMetrics) {
  return { event: String(event), ...data }
}
