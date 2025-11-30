import type { BaseEventMap, EventListenerFn } from "./index.ts"

export type ListenerMap<EventMap extends BaseEventMap = BaseEventMap> = {
  [K in keyof EventMap]?: EventListenerFn<EventMap[K]>[]
}
