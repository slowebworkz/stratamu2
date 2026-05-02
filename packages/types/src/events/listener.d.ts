import type { BaseEventMap, EventKey, ListenerFn } from "./index.ts"

/**
 * Listener for a single-payload event, defined in terms of ListenerFn for consistency.
 * Accepts the event payload as a single argument.
 *
 * @template EventMap - The event map type
 * @template Name - The event key (defaults to all keys of EventMap)
 */
export type Listener<
  EventMap extends BaseEventMap = BaseEventMap,
  Name extends EventKey<EventMap> = EventKey<EventMap>,
> = ListenerFn<{ [K in Name]: [EventMap[K]] }, Name>
