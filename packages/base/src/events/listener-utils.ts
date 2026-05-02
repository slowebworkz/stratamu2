import type { AllEvents, AllEventKeys, CancelablePromise } from "@/events"
import type { BaseEventMap, ListenerFn, EventListener, EventKey } from "@repo/types"

/**
 * Unwraps single-element tuples to their value, otherwise returns the full tuple.
 */
type UnwrapSingleTuple<T extends unknown[]> = T extends [infer U] ? U : T

/**
 * Wraps non-array values in a tuple, preserves arrays as-is.
 */
type WrapInTuple<T> = T extends unknown[] ? T : [T]

/**
 * Checks if the array is a single-element tuple.
 */
function isSingleElement<T>(arr: readonly T[]): arr is readonly [T] {
  return arr.length === 1
}

/**
 * Converts tuple-style arguments to Emittery-compatible single argument format.
 * Single-element tuples are unwrapped to their value for cleaner event data.
 */
export function tupleToEmitteryArg<T extends unknown[]>(args: T): UnwrapSingleTuple<T> {
  return isSingleElement(args) ? (args[0] as UnwrapSingleTuple<T>) : (args as UnwrapSingleTuple<T>)
}

/**
 * Converts Emittery event data to tuple format for listener invocation.
 * Wraps non-array values in a tuple, passes arrays through as-is.
 */
export function emitteryArgToTuple<T>(data: T): WrapInTuple<T> {
  if (data === undefined) return [] as WrapInTuple<T>
  return ensureArray(data)
}

/**
 * Ensures the value is an array; wraps non-arrays.
 */
function ensureArray<T>(value: T): WrapInTuple<T> {
  return Array.isArray(value) ? (value as WrapInTuple<T>) : ([value] as WrapInTuple<T>)
}

/**
 * Wraps a Promise<void> and produces a CancelablePromise<T>.
 *
 * @param promise - The original promise (usually Promise<void> from Emittery)
 * @param resolveWith - Optional value to resolve the promise with
 * @param off - Optional cleanup/cancel function to attach as `.off()`
 */
export function wrapCancelablePromise<T extends Promise<unknown>>(
  promise: T,
  off?: () => void,
): CancelablePromise<Awaited<T>> {
  return Object.assign(promise, { off: off ?? (() => void 0) }) as CancelablePromise<Awaited<T>>
}

export function convertToEmitteryListener<EventMap extends BaseEventMap, K extends keyof EventMap>(
  listener: ListenerFn<EventMap, K>,
): (eventData: AllEvents<EventMap>[K]) => Promise<void> {
  return async (eventData: AllEvents<EventMap>[K]) => {
    const args = emitteryArgToTuple(eventData) as EventMap[K]
    await listener(...args)
  }
}

/**
 * Normalizes event key and listener for registry compatibility.
 * Ensures types are correct for ListenerRegistry methods.
 */
export function toRegistryKeyAndListener<EventMap extends BaseEventMap, K extends keyof EventMap>(
  event: K,
  listener: ListenerFn<EventMap, K>,
): [K, ListenerFn<EventMap, K>] {
  // This function is mostly for type inference and future-proofing.
  // If runtime normalization is needed, add it here.
  return [event, listener]
}

/* export function adaptListenerForRegistry<
  EventMap extends BaseEventMap,
  K extends AllEventKeys<EventMap>
>(
  listener: ListenerFn<EventMap, K>
): EventListener<EventMap, EventKey<EventMap>> {
  return ((...args: unknown[]) => listener(...(args as EventMap[K]))) as EventListener<EventMap, EventKey<EventMap>>
}
 */

export function adaptListenerForRegistry<
  EventMap extends BaseEventMap,
  K extends EventKey<EventMap>,
>(event: K, listener: ListenerFn<EventMap, K>): [K, EventListener<EventMap, K>] {
  return [
    event,
    ((...args: unknown[]) => listener(...(args as EventMap[K]))) as EventListener<EventMap, K>,
  ]
}
