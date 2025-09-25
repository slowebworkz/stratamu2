import type { ReadonlyDeep, Simplify } from 'type-fest'
import type {
  Count,
  EfficiencyRatio,
  EfficiencyThreshold,
  ErrorCount,
  EventName,
  ListenerName,
  TimeInMs,
} from './types.js'

/**
 * EventMetrics class encapsulates per-event emission statistics with type-safe branded properties.
 * Uses type-fest utilities for enhanced type safety and better domain modeling.
 * Created dynamically in getEventMetrics() with implicit typing from constructor parameters.
 */
export class EventMetrics {
  // Private memoization cache
  private _cachedAverageTimeMs?: TimeInMs
  private _cachedEfficiencyRatio?: EfficiencyRatio

  constructor(
    public readonly event: EventName,
    public readonly count: Count,
    public readonly totalTimeMs: TimeInMs,
    public readonly lastTimeMs: TimeInMs,
    public readonly slowestListener?: ListenerName,
    public readonly slowestTimeMs?: TimeInMs,
    public readonly errorCount: ErrorCount = 0 as ErrorCount,
  ) {
    // Validate data integrity
    if (count < 0) {
      throw new TypeError(`EventMetrics: count must be non-negative, got ${count}`)
    }
    if (totalTimeMs < 0) {
      throw new TypeError(`EventMetrics: totalTimeMs must be non-negative, got ${totalTimeMs}`)
    }
    if (lastTimeMs < 0) {
      throw new TypeError(`EventMetrics: lastTimeMs must be non-negative, got ${lastTimeMs}`)
    }
    if (slowestTimeMs !== undefined && slowestTimeMs < 0) {
      throw new TypeError(`EventMetrics: slowestTimeMs must be non-negative, got ${slowestTimeMs}`)
    }
    if (errorCount < 0) {
      throw new TypeError(`EventMetrics: errorCount must be non-negative, got ${errorCount}`)
    }
    if ((slowestListener === undefined) !== (slowestTimeMs === undefined)) {
      throw new TypeError(
        'EventMetrics: slowestListener and slowestTimeMs must both be defined or both be undefined',
      )
    }
  }

  /**
   * Calculate average time per emission with memoization.
   * @returns Average time in milliseconds as branded TimeInMs, or 0 if no emissions
   */
  get averageTimeMs(): TimeInMs {
    if (this._cachedAverageTimeMs === undefined) {
      this._cachedAverageTimeMs = (this.count > 0 ? this.totalTimeMs / this.count : 0) as TimeInMs
    }
    return this._cachedAverageTimeMs
  }

  /**
   * Calculate efficiency ratio with memoization.
   * @returns Ratio of slowest to average time as branded EfficiencyRatio
   */
  get efficiencyRatio(): EfficiencyRatio {
    if (this._cachedEfficiencyRatio === undefined) {
      const avg = this.averageTimeMs
      this._cachedEfficiencyRatio = (
        avg > 0 && this.slowestTimeMs ? this.slowestTimeMs / avg : 1
      ) as EfficiencyRatio
    }
    return this._cachedEfficiencyRatio
  }

  /**
   * Check if this event has performance concerns with constrained threshold.
   * @param threshold Efficiency threshold (1-10), defaults to 3x average
   * @returns True if efficiency ratio exceeds threshold
   */
  hasConcerns(threshold: EfficiencyThreshold = 3 as EfficiencyThreshold): boolean {
    return this.efficiencyRatio > threshold
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
    const totalAttempts = this.count + this.errorCount
    if (totalAttempts === 0) return 100
    return (this.count / totalAttempts) * 100
  }

  /**
   * Calculate the error rate for this event.
   * @returns Error rate as a percentage (0-100), or 0 if no emissions
   */
  getErrorRate(): number {
    return 100 - this.getSuccessRate()
  }

  /**
   * Check if this event is a performance outlier.
   * An event is considered an outlier if its slowest listener is significantly slower than average.
   * @returns True if slowest listener is more than 5x the average time
   */
  isPerformanceOutlier(): boolean {
    return this.hasConcerns(5 as EfficiencyThreshold)
  }

  /**
   * Get performance classification for this event.
   * @returns Performance level: 'excellent', 'good', 'concerning', or 'poor'
   */
  getPerformanceLevel(): 'excellent' | 'good' | 'concerning' | 'poor' {
    if (!this.hasEmissions()) return 'excellent'

    const ratio = this.efficiencyRatio
    if (ratio <= 1.5) return 'excellent'
    if (ratio <= 2.5) return 'good'
    if (ratio <= 4) return 'concerning'
    return 'poor'
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
    if (!this.hasEmissions() && !this.hasErrors()) return 'No emissions recorded'

    const level = this.getPerformanceLevel()
    const avg = this.averageTimeMs.toFixed(2)
    const ratio = this.efficiencyRatio.toFixed(1)
    const successRate = this.getSuccessRate().toFixed(1)

    let summary = `${level.toUpperCase()}: avg ${avg}ms, efficiency ratio ${ratio}x`
    if (this.hasErrors()) {
      summary += `, success rate ${successRate}%`
    }

    return summary
  }

  /**
   * Format metrics for logging or display with type-safe string operations.
   * @returns Human-readable string representation guaranteed to be non-empty
   */
  toString(): string {
    const parts = [
      `${this.event}: ${this.count} emissions`,
      `avg: ${this.averageTimeMs.toFixed(2)}ms`,
      `total: ${this.totalTimeMs.toFixed(2)}ms`,
    ]

    if (this.hasErrors()) {
      parts.push(`errors: ${this.errorCount} (${this.getErrorRate().toFixed(1)}%)`)
    }

    if (this.slowestTimeMs && this.slowestListener) {
      parts.push(`slowest: ${this.slowestListener} (${this.slowestTimeMs.toFixed(2)}ms)`)
    }

    return parts.join(', ')
  }

  /**
   * Convert to plain object for serialization with enhanced typing.
   * @returns Simplified and readonly object representation with computed properties
   */
  toJSON(): Simplify<
    ReadonlyDeep<{
      event: EventName
      count: Count
      totalTimeMs: TimeInMs
      lastTimeMs: TimeInMs
      averageTimeMs: TimeInMs
      efficiencyRatio: EfficiencyRatio
      errorCount: ErrorCount
      successRate: number
      slowestListener?: ListenerName
      slowestTimeMs?: TimeInMs
    }>
  > {
    return {
      event: this.event,
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
