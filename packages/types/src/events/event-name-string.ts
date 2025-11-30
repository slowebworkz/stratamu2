import type { BaseEventMap, EventName } from "./index.ts"

/**
 * Utility type: If EventName<EventMap> is a string, use it; otherwise, fall back to string.
 */
export type EventNameString<EventMap extends BaseEventMap = BaseEventMap> =
  EventName<EventMap> extends string ? EventName<EventMap> : string
