// ============================================================================
// Imports
// ============================================================================
import type { BaseEventMap } from '@repo/types'
import type { Promisable } from 'type-fest'

// ============================================================================
// Base Types
// ============================================================================

/** Generic event name type (single or array) */
export type EventName<EventMap extends BaseEventMap<unknown>> =
  | keyof EventMap
  | readonly (keyof EventMap)[]

/** Base event listener function type */
export type EventListenerFn<T> = (data: T) => Promisable<void>

/** Generic event listener type for event data */
export type EventListener<
  EventMap extends BaseEventMap<any> = BaseEventMap,
  Name extends keyof EventMap = keyof EventMap,
> = EventListenerFn<EventMap[Name]>

export type ListenerMap<EventMap> = {
  [K in keyof EventMap]?: EventListenerFn<EventMap[K]>[]
}

export type EmitResult<T> = Promise<Awaited<ReturnType<EventListenerFn<T>>>[]>

/** Unsubscribe function type */
export type UnsubscribeFunction = () => void

// ============================================================================
// Events Class Types
// ============================================================================

/**
 * EventsListeners: Internal type for listeners storage in Events class.
 */
export type EventsListeners<EventMap extends BaseEventMap> = {
  [K in keyof EventMap]?: Array<EventListenerFn<EventMap[K]>>
}

// ============================================================================
// SafeEmitter Types
// ============================================================================

/**
 * SafeEmitterEventMap: Event map for SafeEmitter.
 */
export type SafeEmitterEventMap<EventMap extends BaseEventMap<any> = BaseEventMap> = EventMap

/**
 * SafeEmitterEventName: Event name type for SafeEmitter.
 */
export type SafeEmitterEventName<EventMap extends BaseEventMap<any> = BaseEventMap> = EventName<
  SafeEmitterEventMap<EventMap>
>

/**
 * SafeEmitterListener: EventListener type for SafeEmitter events.
 */
export type SafeEmitterListener<
  EventMap extends BaseEventMap<any> = BaseEventMap,
  Name extends keyof SafeEmitterEventMap<EventMap> = keyof SafeEmitterEventMap<EventMap>,
> = EventListener<SafeEmitterEventMap<EventMap>, Name>
