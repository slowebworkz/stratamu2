import type {
  // EventNameString,
  EfficiencyRatio,
  EfficiencyThreshold,
  PerformanceLevel,
} from "@/events"
import { PERFORMANCE_THRESHOLDS } from "@/events"
import type { Count, ErrorCount, ListenerName, TimeInMs } from "@/performance"
import { isFiniteNumber, isNumber } from "@/utils"
import type { EventName } from "@repo/types"
import type { ReadonlyDeep, Simplify } from "type-fest"

/**
 * EventMetrics class encapsulates per-event emission statistics with type-safe branded properties.
 * Uses type-fest utilities for enhanced type safety and better domain modeling.
 * Created dynamically in getEventMetrics() with implicit typing from constructor parameters.
 */
export class EventMetrics<EventMap extends Record<string, unknown> = Record<string, unknown>> {
  // Private memoization cache
  private _cachedAverageTimeMs?: TimeInMs
  private _cachedEfficiencyRatio?: EfficiencyRatio | undefined
  private _cachedSuccessRate?: number
  private _cachedErrorRate?: number

  constructor(
    public readonly event: EventName<EventMap>,
    public readonly count: Count,
    public readonly totalTimeMs: TimeInMs,
    public readonly lastTimeMs: TimeInMs,
    public readonly slowestListener?: ListenerName,
    public readonly slowestTimeMs?: TimeInMs,
    public readonly errorCount: ErrorCount = 0 as ErrorCount,
  ) {
    validateEventMetricsInput({
      count,
      totalTimeMs,
      lastTimeMs,
      slowestTimeMs,
      slowestListener,
      errorCount,
    })
    // Enforce immutability at runtime to prevent stale memoized values
    Object.freeze(this)
  }

  /**
   * Calculate average time per emission with memoization.
   * @returns Average time in milliseconds as branded TimeInMs, or 0 if no emissions
   */
  get averageTimeMs(): TimeInMs {
    if (this._cachedAverageTimeMs === undefined) {
      this._cachedAverageTimeMs = computeAverageTimeMs(this.count, this.totalTimeMs)
    }
    return this._cachedAverageTimeMs
  }

  /**
   * Calculate efficiency ratio with memoization.
   * @returns Ratio of slowest to average time as branded EfficiencyRatio
   */
  get efficiencyRatio(): EfficiencyRatio | undefined {
    if (this._cachedEfficiencyRatio !== undefined) {
      return this._cachedEfficiencyRatio
    }
    this._cachedEfficiencyRatio = computeEfficiencyRatio(this.averageTimeMs, this.slowestTimeMs)
    return this._cachedEfficiencyRatio
  }

  /**
   * Check if this event has performance concerns with constrained threshold.
   * @param threshold Efficiency threshold (1-10), defaults to 3x average
   * @returns True if efficiency ratio exceeds threshold
   */
  hasConcerns(threshold: EfficiencyThreshold = PERFORMANCE_THRESHOLDS.concern): boolean {
    return hasPerformanceConcerns(this.efficiencyRatio, threshold)
  }

  /**
   * Check if this event has any emissions.
   * @returns True if the event has been emitted at least once
   */
  hasEmissions(): boolean {
    return this.count > 0
  }

  /**
   * Check if this event has any errors.
   * @returns True if the event has had at least one error
   */
  hasErrors(): boolean {
    return this.errorCount > 0
  }

  /**
   * Calculate the success rate for this event.
   * @returns Success rate as a percentage (0-100), or 100 if no emissions
   */
  getSuccessRate(): number {
    if (this._cachedSuccessRate !== undefined) {
      return this._cachedSuccessRate
    }
    this._cachedSuccessRate = computeSuccessRate(this.count, this.errorCount)
    return this._cachedSuccessRate
  }

  /**
   * Calculate the error rate for this event.
   * @returns Error rate as a percentage (0-100), or 0 if no emissions
   */
  getErrorRate(): number {
    if (this._cachedErrorRate !== undefined) {
      return this._cachedErrorRate
    }
    this._cachedErrorRate = computeErrorRate(this.count, this.errorCount)
    return this._cachedErrorRate
  }

  /**
   * Check if this event is a performance outlier.
   * An event is considered an outlier if its slowest listener is significantly slower than average.
   * @returns True if slowest listener is more than 5x the average time
   */
  isPerformanceOutlier(): boolean {
    return hasPerformanceConcerns(this.efficiencyRatio, PERFORMANCE_THRESHOLDS.outlier)
  }

  /**
   * Get performance classification for this event.
   * @returns Performance level: 'excellent', 'good', 'concerning', or 'poor'
   */
  getPerformanceLevel(): PerformanceLevel {
    return getPerformanceLevel(this.efficiencyRatio, this.hasEmissions())
  }

  /**
   * Check if this event is faster than another event on average.
   * @param other EventMetrics instance to compare against
   * @returns True if this event has a lower average time
   */
  isFasterThan(other: EventMetrics): boolean {
    return this.averageTimeMs < other.averageTimeMs
  }

  /**
   * Get a formatted performance summary.
   * @returns Concise performance description including error information
   */
  getPerformanceSummary(): string {
    return formatPerformanceSummary({
      hasEmissions: this.hasEmissions(),
      hasErrors: this.hasErrors(),
      level: this.getPerformanceLevel(),
      avg: this.averageTimeMs,
      ratio: this.efficiencyRatio,
      successRate: this.getSuccessRate(),
    })
  }

  /**
   * Format metrics for logging or display with type-safe string operations.
   * @returns Human-readable string representation guaranteed to be non-empty
   */
  toString(): string {
    return formatMetricsString({
      event: toEventNameString(this.event),
      count: this.count,
      avg: this.averageTimeMs,
      total: this.totalTimeMs,
      hasErrors: this.hasErrors(),
      errorCount: this.errorCount,
      errorRate: this.getErrorRate(),
      slowestListener: this.slowestListener,
      slowestTimeMs: this.slowestTimeMs,
    })
  }

  /**
   * Convert to plain object for serialization with enhanced typing.
   * @returns Simplified and readonly object representation with computed properties
   */
  toJSON(): Simplify<
    ReadonlyDeep<{
      event: string
      count: Count
      totalTimeMs: TimeInMs
      lastTimeMs: TimeInMs
      averageTimeMs: TimeInMs
      efficiencyRatio: EfficiencyRatio | undefined
      errorCount: ErrorCount
      successRate: number
      slowestListener?: ListenerName
      slowestTimeMs?: TimeInMs
    }>
  > {
    return {
      event: toEventNameString(this.event),
      count: this.count,
      totalTimeMs: this.totalTimeMs,
      lastTimeMs: this.lastTimeMs,
      averageTimeMs: this.averageTimeMs,
      efficiencyRatio: this.efficiencyRatio,
      errorCount: this.errorCount,
      successRate: this.getSuccessRate(),
      slowestListener: this.slowestListener,
      slowestTimeMs: this.slowestTimeMs,
    }
  }
}

/**
 * Returns a string representation of the argument.
 * If the argument is already a string, returns it as is.
 * Otherwise, returns String(arg).
 */
function toEventNameString<T>(arg: T): string {
  return typeof arg === "string" ? arg : String(arg)
}

/**
 * Formats a number to a fixed number of digits, or a fallback if not finite.
 * @param value - The number to format (may be undefined or null)
 * @param digits - Number of decimal places (default: 2)
 * @param fallback - String to use if value is not a finite number (default: 'N/A')
 */
function formatNumber(value: number | null | undefined, digits = 2, fallback = "N/A"): string {
  if (!isNumber(value) || !isFiniteNumber(value)) return fallback
  return value.toFixed(digits)
}

/**
 * Computes the average time per emission.
 * Returns 0 if count is zero or if the result is not a finite, non-negative number.
 */
function computeAverageTimeMs(count: Count, totalTimeMs: TimeInMs): TimeInMs {
  if (!isNumber(count) || !isNumber(totalTimeMs)) {
    throw new TypeError("computeAverageTimeMs: count and totalTimeMs must be numbers")
  }
  if (count <= 0) return 0 as TimeInMs
  const avg = totalTimeMs / count
  return (Number.isFinite(avg) && avg >= 0 ? avg : 0) as TimeInMs
}

/**
 * Computes the efficiency ratio (slowestTimeMs / averageTimeMs).
 * Returns undefined if slowestTimeMs is undefined, or if either argument is not a finite, non-negative number, or if averageTimeMs is not positive.
 */
function computeEfficiencyRatio(
  averageTimeMs: TimeInMs,
  slowestTimeMs?: TimeInMs,
): EfficiencyRatio | undefined {
  if (slowestTimeMs === undefined) return undefined
  if (!isNumber(averageTimeMs) || !isNumber(slowestTimeMs)) return undefined
  if (!Number.isFinite(averageTimeMs) || !Number.isFinite(slowestTimeMs)) return undefined
  if (averageTimeMs <= 0 || slowestTimeMs < 0) return undefined
  const ratio = slowestTimeMs / averageTimeMs
  return (Number.isFinite(ratio) && ratio >= 0 ? ratio : undefined) as EfficiencyRatio | undefined
}

/**
 * Computes the success rate as a percentage (0-100).
 * Returns 100 if there are no attempts, clamps result to [0, 100], and checks for valid, non-negative, finite inputs.
 */
function computeSuccessRate(count: Count, errorCount: ErrorCount): number {
  if (!isNumber(count) || !isNumber(errorCount)) {
    throw new TypeError("computeSuccessRate: count and errorCount must be numbers")
  }
  if (!Number.isFinite(count) || !Number.isFinite(errorCount) || count < 0 || errorCount < 0) {
    return 100
  }
  const totalAttempts = count + errorCount
  if (totalAttempts === 0) return 100
  const rate = (count / totalAttempts) * 100
  if (!Number.isFinite(rate) || rate < 0) return 0
  if (rate > 100) return 100
  return rate
}

/**
 * Computes the error rate as a percentage (0-100).
 * Returns 0 if there are no attempts, clamps result to [0, 100], and checks for valid, non-negative, finite inputs.
 */
function computeErrorRate(count: Count, errorCount: ErrorCount): number {
  if (!isNumber(count) || !isNumber(errorCount)) {
    throw new TypeError("computeErrorRate: count and errorCount must be numbers")
  }
  if (!Number.isFinite(count) || !Number.isFinite(errorCount) || count < 0 || errorCount < 0) {
    return 0
  }
  const totalAttempts = count + errorCount
  if (totalAttempts === 0) return 0
  const rate = (errorCount / totalAttempts) * 100
  if (!Number.isFinite(rate) || rate < 0) return 0
  if (rate > 100) return 100
  return rate
}

/**
 * Checks if the efficiency ratio exceeds the given threshold.
 * Returns false if ratio or threshold is not a finite, positive number.
 */
function hasPerformanceConcerns(
  ratio: EfficiencyRatio | undefined,
  threshold: EfficiencyThreshold,
): boolean {
  if (!isNumber(ratio) || !Number.isFinite(ratio) || ratio <= 0) return false
  if (!isNumber(threshold) || !Number.isFinite(threshold) || threshold <= 0) return false
  return ratio > threshold
}

/**
 * Classifies performance level based on efficiency ratio and emissions.
 * Returns 'excellent' if no emissions or if ratio is not a finite number.
 */
function getPerformanceLevel(
  ratio: EfficiencyRatio | undefined,
  hasEmissions: boolean,
): PerformanceLevel {
  const r = isNumber(ratio) && Number.isFinite(ratio) ? ratio : 1
  if (!hasEmissions || r <= 1.5) return "excellent"
  if (r <= 2.5) return "good"
  if (r <= 4) return "concerning"
  return "poor"
}

/**
 * Formats a concise performance summary for event metrics.
 * @param params - Object with all required summary fields
 * @returns Human-readable summary string
 */
function formatPerformanceSummary(params: {
  hasEmissions: boolean
  hasErrors: boolean
  level: PerformanceLevel
  avg: TimeInMs
  ratio?: EfficiencyRatio
  successRate: number
}): string {
  const { hasEmissions, hasErrors, level, avg, ratio, successRate } = params
  if (!hasEmissions && !hasErrors) return "No emissions recorded"

  const avgStr = formatNumber(avg, 2)
  const ratioStr = formatNumber(ratio ?? 1, 1)
  const successRateStr = formatNumber(successRate, 1)

  const LEVEL_LABEL = `${level.toUpperCase()}:`
  const AVG_LABEL = `avg ${avgStr}ms`
  const RATIO_LABEL = `efficiency ratio ${ratioStr}x`
  const SUCCESS_LABEL = `success rate ${successRateStr}%`
  const parts = [LEVEL_LABEL, AVG_LABEL, RATIO_LABEL]
  if (hasErrors) parts.push(SUCCESS_LABEL)
  return parts.join(", ")
}

/**
 * Formats a detailed metrics string for logging or display.
 * @param params - Object with all required and optional fields
 * @returns Human-readable, non-empty string
 */
function formatMetricsString(params: {
  event: string
  count: Count
  avg: TimeInMs
  total: TimeInMs
  hasErrors: boolean
  errorCount: ErrorCount
  errorRate: number
  slowestListener?: ListenerName
  slowestTimeMs?: TimeInMs
}): string {
  const {
    event,
    count,
    avg,
    total,
    hasErrors,
    errorCount,
    errorRate,
    slowestListener,
    slowestTimeMs,
  } = params

  const EVENT_LABEL = `${event}: ${count} emissions`
  const AVG_LABEL = `avg: ${formatNumber(avg, 2)}ms`
  const TOTAL_LABEL = `total: ${formatNumber(total, 2)}ms`
  const ERRORS_LABEL = `errors: ${errorCount} (${formatNumber(errorRate, 1)}%)`
  const SLOWEST_LABEL =
    slowestListener && slowestTimeMs !== undefined
      ? `slowest: ${slowestListener} (${formatNumber(slowestTimeMs, 2)}ms)`
      : undefined

  const parts = [EVENT_LABEL, AVG_LABEL, TOTAL_LABEL]
  if (hasErrors) parts.push(ERRORS_LABEL)
  if (SLOWEST_LABEL) parts.push(SLOWEST_LABEL)
  return parts.join(", ")
}

/**
 * Validates input for EventMetrics construction.
 * Throws TypeError if any value is invalid.
 */
function validateEventMetricsInput(params: {
  count: Count
  totalTimeMs: TimeInMs
  lastTimeMs: TimeInMs
  slowestTimeMs?: TimeInMs
  slowestListener?: ListenerName
  errorCount: ErrorCount
}): void {
  const { count, totalTimeMs, lastTimeMs, slowestTimeMs, slowestListener, errorCount } = params

  const checks: [string, unknown, (v: unknown) => boolean, string][] = [
    [
      "count",
      count,
      v => isNumber(v) && v >= 0 && Number.isFinite(v),
      "must be a non-negative finite number",
    ],
    [
      "totalTimeMs",
      totalTimeMs,
      v => isNumber(v) && v >= 0 && Number.isFinite(v),
      "must be a non-negative finite number",
    ],
    [
      "lastTimeMs",
      lastTimeMs,
      v => isNumber(v) && v >= 0 && Number.isFinite(v),
      "must be a non-negative finite number",
    ],
    [
      "errorCount",
      errorCount,
      v => isNumber(v) && v >= 0 && Number.isFinite(v),
      "must be a non-negative finite number",
    ],
  ]
  for (const [name, value, check, msg] of checks) {
    if (!check(value)) throw new TypeError(`EventMetrics: ${name} ${msg}, got ${value}`)
  }
  if (slowestTimeMs !== undefined && (!Number.isFinite(slowestTimeMs) || slowestTimeMs < 0)) {
    throw new TypeError(
      `EventMetrics: slowestTimeMs must be a non-negative finite number, got ${slowestTimeMs}`,
    )
  }
  if ((slowestListener === undefined) !== (slowestTimeMs === undefined)) {
    throw new TypeError(
      "EventMetrics: slowestListener and slowestTimeMs must both be defined or both be undefined",
    )
  }
}
