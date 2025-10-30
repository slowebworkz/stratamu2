import type { EventListenerFn } from './event-listener-fn.ts';

export type ListenerMap<EventMap> = {
  [K in keyof EventMap]?: EventListenerFn<EventMap[K]>[]
}