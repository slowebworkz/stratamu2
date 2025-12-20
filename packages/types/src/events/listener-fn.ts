import type { Awaitable } from "@/base"
import type { BaseEventMap } from "@/events"

/**
 * Strongly-typed listener function for a given event.
 *
 * @template EventMap - The event map type (must have array values)
 * @template EventKey - The event key type (defaults to keyof EventMap, but can be AllEventKeys or similar)
 */
export type ListenerFn<
  EventMap extends BaseEventMap = BaseEventMap,
  EventKey extends keyof EventMap = keyof EventMap,
> = (...args: EventMap[EventKey]) => Awaitable<unknown>
