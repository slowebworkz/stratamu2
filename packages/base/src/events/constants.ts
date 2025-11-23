import type { DeepReadonlyRecord, EfficiencyThreshold } from "@/events"
import type { LiteralUnion, ReadonlyDeep } from "type-fest"

// -----------------------------------------------------------------------------
// General Event Constants
// -----------------------------------------------------------------------------

export const EVENT_PRIORITIES: DeepReadonlyRecord<string, number> = {
  CRITICAL: 1000,
  HIGH: 100,
  NORMAL: 0,
  LOW: -100,
  BACKGROUND: -1000,
} as const

// Type for event priority keys (for use in APIs, etc.)
export type EventPriorityKey = LiteralUnion<keyof typeof EVENT_PRIORITIES, string>

export const EVENT_PATTERNS: DeepReadonlyRecord<Uppercase<string>, RegExp> = {
  LIFECYCLE: /^(init|start|stop|destroy)$/,
  USER_ACTION: /^user\./,
  SYSTEM_EVENT: /^system\./,
  ERROR_EVENT: /^error\./,
  METRIC_EVENT: /^metric\./,
} as const

// -----------------------------------------------------------------------------
// Private event keys for internal error handling
// Symbols ensure privacy and make collisions impossible.
// -----------------------------------------------------------------------------

export const INTERNAL_ON_LISTENER_ERROR = Symbol("internal_on_listener_error")
export const INTERNAL_ON_EMIT_ERROR = Symbol("internal_on_emit_error")
export const INTERNAL_ON_REMOVE_WARN = Symbol("internal_on_remove_warn")
export const INTERNAL_ON_LISTENER_REMOVED = Symbol("internal_on_listener_removed")
export const INTERNAL_ON_CHILD_ERROR = Symbol("internal_on_child_error")
export const INTERNAL_ON_DESTROY = Symbol("internal_on_destroy")
export const INTERNAL_ON_DESTROY_ERROR = Symbol("internal_on_destroy_error")
export const INTERNAL_ENABLE_METRICS = Symbol("internal_enable_metrics")

export type InternalEvent =
  | typeof INTERNAL_ON_LISTENER_ERROR
  | typeof INTERNAL_ON_EMIT_ERROR
  | typeof INTERNAL_ON_REMOVE_WARN
  | typeof INTERNAL_ON_LISTENER_REMOVED
  | typeof INTERNAL_ON_CHILD_ERROR
  | typeof INTERNAL_ON_DESTROY
  | typeof INTERNAL_ENABLE_METRICS

export const INTERNAL_EVENT_KEYS: ReadonlySet<InternalEvent> = new Set([
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_REMOVE_WARN,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_CHILD_ERROR,
  INTERNAL_ON_DESTROY,
  INTERNAL_ENABLE_METRICS,
])

// -----------------------------------------------------------------------------
// Listener States
// -----------------------------------------------------------------------------

export const LISTENER_STATES: ReadonlyDeep<Lowercase<string>[]> = [
  "registered",
  "active",
  "paused",
  "errored",
  "unsubscribed",
] as const

// -----------------------------------------------------------------------------
// Event Metrics Constants (migrated from event-metrics.ts)
// -----------------------------------------------------------------------------

// Instead of `as unknown as EfficiencyThreshold`, we define **brand helpers**
// so numbers can be safely turned into strongly-typed thresholds.
// -----------------------------------------------------------------------------

const efficiencyThreshold = <T extends number>(value: T) => value as T & EfficiencyThreshold

export const ZERO_MS = 0 as const satisfies number
export const ZERO_COUNT = 0 as const satisfies number

export const PERFORMANCE_THRESHOLDS: DeepReadonlyRecord<
  "concern" | "outlier",
  EfficiencyThreshold
> = {
  concern: efficiencyThreshold(3),
  outlier: efficiencyThreshold(5),
} as const

/** Default maximum number of safety log entries to keep per event. */
export const DEFAULT_SAFETY_LOG_CAP = 100 as const
