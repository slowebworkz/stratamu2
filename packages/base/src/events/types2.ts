// ============================================================================
// Imports
// ============================================================================
// Importing necessary types
import type { BaseEventMap } from '@repo/types'
import type { OmnipresentEventData } from 'emittery'
import type { Merge, Promisable } from 'type-fest'

// ============================================================================
// Complex Types (SafeEmitter)
// ============================================================================

/**
 * SafeEmitterEventMap: Event map for SafeEmitter, includes omnipresent events.
 */
export type SafeEmitterEventMap<
  EventMap extends BaseEventMap<any> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = IncludeOmnipresent extends true ? Merge<EventMap, OmnipresentEventData> : EventMap

/**
 * SafeEmitterEventName: Event name type for SafeEmitter.
 */
export type SafeEmitterEventName<
  EventMap extends BaseEventMap<any> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = EventName<SafeEmitterEventMap<EventMap, IncludeOmnipresent>>

/**
 * SafeEmitterListener: Listener type for SafeEmitter events.
 */
export type SafeEmitterListener<
  EventMap extends BaseEventMap<any> = BaseEventMap,
  Name extends keyof SafeEmitterEventMap<EventMap, true> = keyof SafeEmitterEventMap<
    EventMap,
    true
  >,
> = (eventData: SafeEmitterEventMap<EventMap, true>[Name]) => Promisable<void>

// ============================================================================
// Complex Types (LoggedEmitter)
// ============================================================================
/**
 * LoggedEmitterEventMap: Event map for LoggedEmitter, includes omnipresent events.
 */
export type LoggedEmitterEventMap<
  EventMap extends BaseEventMap<any> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = IncludeOmnipresent extends true ? Merge<EventMap, OmnipresentEventData> : EventMap

/**
 * LoggedEmitterEventName: Event name type for LoggedEmitter.
 */
export type LoggedEmitterEventName<
  EventMap extends BaseEventMap<any> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = EventName<LoggedEmitterEventMap<EventMap, IncludeOmnipresent>>

/**
 * LoggedEmitterListener: Listener type for LoggedEmitter events.
 */
export type LoggedEmitterListener<
  EventMap extends BaseEventMap<any> = BaseEventMap,
  Name extends keyof LoggedEmitterEventMap<EventMap, true> = keyof LoggedEmitterEventMap<
    EventMap,
    true
  >,
> = (eventData: LoggedEmitterEventMap<EventMap, true>[Name]) => Promisable<void>

// ============================================================================
// Base Types
// ============================================================================
/** Generic event name type (single or array) */
export type EventName<EventMap extends BaseEventMap<unknown>> =
  | keyof EventMap
  | readonly (keyof EventMap)[]

/** Generic listener type for event data */
export type Listener<
  EventMap extends BaseEventMap<any> = BaseEventMap,
  Name extends keyof EventMap = keyof EventMap,
> = (eventData: EventMap[Name]) => Promisable<void>

/** Unsubscribe function type */
export type UnsubscribeFunction = () => void

// ============================================================================
// Intermediate Types
// ============================================================================
/** Compose full event map with omnipresent events (using type-fest Merge) */
export type FullEventMap<EventMap extends BaseEventMap<any> = BaseEventMap> = Merge<
  EventMap,
  OmnipresentEventData
>

/** Simplified event name for full event map */
export type FullEventName<EventMap extends BaseEventMap<any> = BaseEventMap> = EventName<
  FullEventMap<EventMap>
>

/** Listener for full event map */
export type FullListener<
  EventMap extends BaseEventMap<unknown>,
  Name extends keyof FullEventMap<EventMap> = keyof FullEventMap<EventMap>,
> = Listener<FullEventMap<EventMap>, Name>

// ============================================================================
// Complex Types (MetricsEmitter)
// ============================================================================
/**
 * MetricsEmitterEvents: Mapped type for metrics event data.
 * Accepts a BaseEventMap of arrays (event args), and produces a map of event names to event data objects.
 */
export type MetricsEmitterEvents<EventMap extends BaseEventMap<unknown[]>> = {
  [K in keyof EventMap]: {
    eventName: K
    args: EventMap[K]
    time?: number
    error?: Error
    count?: number
  }
}

export type MetricsEmitterFullEventMap<EventMap extends BaseEventMap<unknown[]>> =
  MetricsEmitterEvents<EventMap> & OmnipresentEventData

export type MetricsEmitterEventName<EventMap extends BaseEventMap<unknown[]>> =
  keyof MetricsEmitterFullEventMap<EventMap>

export type MetricsEmitterListener<
  EventMap extends BaseEventMap<unknown[]>,
  Name extends MetricsEmitterEventName<EventMap> = MetricsEmitterEventName<EventMap>,
> = (eventData: MetricsEmitterFullEventMap<EventMap>[Name]) => Promisable<void>
