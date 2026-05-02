import type { Awaitable } from "../base/index.ts"

// Base event listener function type (single-argument payload, Emittery-compatible)
export type EventListenerFn<T> = (eventData: T) => Awaitable<void>

// Adapter: wrap a spread-args listener to single-arg (for tuples)
export type ToSingleArgListener<T extends unknown[]> = EventListenerFn<T>

// Adapter: wrap a single-arg listener to spread-args (for tuple unpacking)
export type ToSpreadArgsListener<T extends unknown[]> = (...args: T) => Awaitable<void>
