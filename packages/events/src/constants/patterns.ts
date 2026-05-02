// ===============================
// Event Pattern Matchers
// ===============================

/**
 * Common event name patterns for pattern matching and filtering.
 * Used to categorize events based on their naming conventions.
 *
 * - LIFECYCLE: Core lifecycle events (init, start, stop, destroy)
 * - USER_ACTION: User-initiated events (prefixed with "user.")
 * - SYSTEM_EVENT: System-level events (prefixed with "system.")
 * - ERROR_EVENT: Error events (prefixed with "error.")
 * - METRIC_EVENT: Metrics and telemetry events (prefixed with "metric.")
 */
export const EVENT_PATTERNS = {
  LIFECYCLE: /^(init|start|stop|destroy)$/,
  USER_ACTION: /^user\./,
  SYSTEM_EVENT: /^system\./,
  ERROR_EVENT: /^error\./,
  METRIC_EVENT: /^metric\./,
} as const

/**
 * Type-safe event pattern keys.
 */
export type EventPatternKey = keyof typeof EVENT_PATTERNS
