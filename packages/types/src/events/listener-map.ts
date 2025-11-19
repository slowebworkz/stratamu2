import type { EventListenerFn } from "./index.ts"

export type ListenerMap<EventMap> = {
  [K in keyof EventMap]?: EventListenerFn<EventMap[K]>[]
}
