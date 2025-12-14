import type { EfficiencyThreshold } from "@/events"
import type { DeepReadonlyRecord } from "@repo/types"
import type { ReadonlyDeep } from "type-fest"

// -----------------------------------------------------------------------------
// Core Engine: Event Priorities
// These exist in every engine, regardless of game type
// -----------------------------------------------------------------------------
export const EVENT_PRIORITIES: DeepReadonlyRecord<Uppercase<string>, number> = {
  CRITICAL: 1000,
  HIGH: 100,
  NORMAL: 0,
  LOW: -100,
  BACKGROUND: -1000,
} as const

// -----------------------------------------------------------------------------
// Core Engine: Event Patterns (Neutral)
// Only generic engine lifecycle and system events
// -----------------------------------------------------------------------------
export const EVENT_PATTERNS: DeepReadonlyRecord<Uppercase<string>, RegExp> = {
  LIFECYCLE: /^(init|start|stop|destroy)$/,
  USER_ACTION: /^user\./,
  SYSTEM_EVENT: /^system\./,
  ERROR_EVENT: /^error\./,
  METRIC_EVENT: /^metric\./,
} as const

// -----------------------------------------------------------------------------
// Core Engine: Internal Event Symbols (private)
// -----------------------------------------------------------------------------
export const INTERNAL_ON_LISTENER_ERROR = Symbol("internal_on_listener_error")
export const INTERNAL_ON_EMIT_ERROR = Symbol("internal_on_emit_error")
export const INTERNAL_ON_REMOVE_WARN = Symbol("internal_on_remove_warn")
export const INTERNAL_ON_LISTENER_REMOVED = Symbol("internal_on_listener_removed")
export const INTERNAL_ON_CHILD_ERROR = Symbol("internal_on_child_error")
export const INTERNAL_ON_DESTROY = Symbol("internal_on_destroy")
export const INTERNAL_ON_DESTROY_ERROR = Symbol("internal_on_destroy_error")
export const INTERNAL_ENABLE_METRICS = Symbol("internal_enable_metrics")

export const INTERNAL_EVENT_KEYS: ReadonlySet<
  | typeof INTERNAL_ON_LISTENER_ERROR
  | typeof INTERNAL_ON_EMIT_ERROR
  | typeof INTERNAL_ON_REMOVE_WARN
  | typeof INTERNAL_ON_LISTENER_REMOVED
  | typeof INTERNAL_ON_CHILD_ERROR
  | typeof INTERNAL_ON_DESTROY
  | typeof INTERNAL_ENABLE_METRICS
> = new Set([
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_REMOVE_WARN,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_CHILD_ERROR,
  INTERNAL_ON_DESTROY,
  INTERNAL_ENABLE_METRICS,
])

// -----------------------------------------------------------------------------
// Core Engine: Listener States
// Generic engine lifecycle states
// -----------------------------------------------------------------------------
export const LISTENER_STATES: ReadonlyDeep<Lowercase<string>[]> = [
  "registered",
  "active",
  "paused",
  "errored",
  "unsubscribed",
] as const

// -----------------------------------------------------------------------------
// Core Engine: Performance / Metrics
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

export const DEFAULT_SAFETY_LOG_CAP = 100 as const
export const LISTENER_COUNT_CACHE_THRESHOLD = 1000 as const

// -----------------------------------------------------------------------------
// Core Engine: Truly Universal Game Constants
// These exist in every MUD/MUSH variant
// -----------------------------------------------------------------------------

// Every game has players and rooms (locations)
export const ENTITY_TYPES = ["player", "room"] as const

// Every entity must have a minimal presence state
export const ENTITY_STATES = ["active", "inactive"] as const

// -----------------------------------------------------------------------------
// Adapter Extensions
// Each adapter can extend the core constants:
// ENTITY_TYPES, ENTITY_STATES, EVENT_PATTERNS, etc.
// Example:
//   export const ENTITY_TYPES = [...CORE_ENTITY_TYPES, "npc", "mob", "item"]
// -----------------------------------------------------------------------------
