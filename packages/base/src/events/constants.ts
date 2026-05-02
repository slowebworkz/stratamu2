import type { EfficiencyThreshold } from "@/events"
import type { DeepReadonlyRecord } from "@repo/types"
import type { ReadonlyDeep } from "type-fest"

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

export const DEFAULT_SAFETY_LOG_CAP = 10 as const
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
