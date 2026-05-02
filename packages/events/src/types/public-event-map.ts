import type { BaseEventMap } from "@repo/types"
import type { LiteralUnion, Simplify } from "type-fest"

/** Extracts only string keys from an object. */
type StringKeys<T> = Extract<keyof T, string>

/** Optional single-argument tuple helper. */
type OptionalArg<T = unknown> = [arg?: T]

/**
 * Developer-facing map of public events.
 * Includes all user-defined string-keyed events and public control events.
 * @template Map User-defined event map
 */
export type PublicEventMap<Map extends BaseEventMap> = Simplify<
  Pick<Map, StringKeys<Map>> & {
    resetErrorCounts: OptionalArg<string>
    clearSafetyLogs: OptionalArg<string>
    enableSafeMode: [enabled: boolean]
  }
>

/**
 * All public event names (string keys and dynamic strings).
 * @template Map User-defined event map
 */
export type PublicEventName<Map extends BaseEventMap> = LiteralUnion<
  StringKeys<PublicEventMap<Map>>,
  string
>
