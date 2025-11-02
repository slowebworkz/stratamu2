import type { Promisable } from 'type-fest'

// Base event listener function type
export type EventListenerFn<T> = (data: T) => Promisable<void>
