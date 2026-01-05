import type { BaseEventMap, EmitterEventKey } from "@repo/types"
import type { Simplify } from "type-fest"

// -----------------------------------------------------------------------------
// Internal Event Symbols
// -----------------------------------------------------------------------------

export const ENABLE_SAFE_MODE = Symbol("enable_safe_mode")

// -----------------------------------------------------------------------------
// Internal Event Map
// -----------------------------------------------------------------------------

export type SafetyManagerEventMap<EventMap extends BaseEventMap> = Simplify<{
  [ENABLE_SAFE_MODE]: [eventName: EmitterEventKey<EventMap> | "*", enabled: boolean]
  // Add more internal events here as needed, e.g.:
  // resetErrorCounts: [eventName?: EmitterEventKey<EventMap>]
  // clearSafetyLogs: [eventName?: EmitterEventKey<EventMap>]
}>
