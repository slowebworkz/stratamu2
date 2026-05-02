import type { LiteralUnion, Tagged } from "type-fest"
import type { PERFORMANCE_LEVELS } from "./index.ts"

/**
 * Performance level classification for event metrics.
 */
export type PerformanceLevel = (typeof PERFORMANCE_LEVELS)[number]

export type TimeInMs = Tagged<number, "TimeInMs">

export type Count = Tagged<number, "Count">

export type ErrorCount = Tagged<number, "ErrorCount">

export type ListenerName = LiteralUnion<"<anonymous>", string>
