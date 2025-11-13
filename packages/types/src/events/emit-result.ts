import type { EventListenerFn } from './index.ts'

// The return type of an event listener function
export type ListenerReturnType<T> = ReturnType<EventListenerFn<T>>

// The awaited (resolved) value of a listener function
export type AwaitedListenerReturnType<T> = Awaited<ListenerReturnType<T>>

// The result of a listener (awaited return type)
export type ListenerResult<T> = AwaitedListenerReturnType<T>

// The array of listener results
export type ListenerResultsArray<T> = ListenerResult<T>[]

// The promise of all listener results
export type EmitResult<T> = Promise<ListenerResultsArray<T>>
