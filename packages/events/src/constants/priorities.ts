// ===============================
// Event Priority Levels
// ===============================

/**
 * Standard priority levels for event listeners.
 * Higher values execute first. Use these constants for consistent priority ordering.
 *
 * - CRITICAL: 1000 - Must execute first (shutdown handlers, critical errors)
 * - HIGH: 100 - Important operations (validation, authentication)
 * - NORMAL: 0 - Default priority for most listeners
 * - LOW: -100 - Non-critical operations (logging, analytics)
 * - BACKGROUND: -1000 - Lowest priority (cleanup, background tasks)
 */
export const EVENT_PRIORITIES = {
  CRITICAL: 1000,
  HIGH: 100,
  NORMAL: 0,
  LOW: -100,
  BACKGROUND: -1000,
} as const

/**
 * Type-safe priority value union.
 */
export type EventPriority = (typeof EVENT_PRIORITIES)[keyof typeof EVENT_PRIORITIES]
