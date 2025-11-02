import type { EventListenerFn } from './event-listener-fn.ts'

export type EmitResult<T> = Promise<Awaited<ReturnType<EventListenerFn<T>>>[]>
