import type { EventListenerFn } from "../../events/index.ts"

// The return type of an event listener function
export type ListenerReturnType<T extends unknown[]> = ReturnType<EventListenerFn<T>>

// The awaited (resolved) value of a listener function
export type AwaitedListenerReturnType<T extends unknown[]> = Awaited<ListenerReturnType<T>>

// The result of a listener (awaited return type)
export type ListenerResult<T extends unknown[]> = AwaitedListenerReturnType<T>

// The array of listener results
export type ListenerResultsArray<T extends unknown[]> = ListenerResult<T>[]

// The promise of all listener results
export type EmitResult<T extends unknown[]> = Promise<ListenerResultsArray<T>>
