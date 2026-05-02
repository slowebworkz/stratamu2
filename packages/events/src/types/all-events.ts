import type { BaseEventMap, EventKey } from "@repo/types"
import type { InternalEventMap } from "./index.ts"
import type { Simplify } from "type-fest"

/**
 * Types for working with user and internal events together.
 */

/**
 * Combined event map (user + internal).
 * @template Map User event map
 */
export type AllEvents<Map extends BaseEventMap> = Simplify<Map & InternalEventMap<Map>>

/**
 * All event keys (user + internal).
 * @template Map User event map
 */
export type AllEventKeys<Map extends BaseEventMap> = EventKey<AllEvents<Map>>
