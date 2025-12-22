import type { BaseEventMap, EventListenerFn } from "@/events"

export type ListenerMap<EventMap extends BaseEventMap = BaseEventMap> = {
  [K in keyof EventMap]?: EventListenerFn<EventMap[K]>[]
}
