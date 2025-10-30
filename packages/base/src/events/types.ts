
import type { BaseEventMap, EventName, EventListenerFn } from '@repo/types'
import type { OmnipresentEventData, UnsubscribeFunction } from 'emittery'
import type { Merge, Promisable } from 'type-fest'


// Base Types

// Generic listener type for event data
export type Listener<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  Name extends keyof EventMap = keyof EventMap,
> = (eventData: EventMap[Name]) => Promisable<void>

// Compose full event map with omnipresent events (using type-fest Merge)
export type FullEventMap<EventMap extends BaseEventMap<unknown> = BaseEventMap> = Merge<
  EventMap,
  OmnipresentEventData
>

// Simplified event name for full event map
export type FullEventName<EventMap extends BaseEventMap<unknown> = BaseEventMap> = EventName<
  FullEventMap<EventMap>
>

// Listener for full event ma
export type FullListener<
  EventMap extends BaseEventMap<unknown>,
  Name extends keyof FullEventMap<EventMap> = keyof FullEventMap<EventMap>,
> = Listener<FullEventMap<EventMap>, Name>

// Generic event listener type for event data
export type EventListener<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  Name extends keyof EventMap = keyof EventMap,
> = EventListenerFn<EventMap[Name]>

// SafeEmitter Types

// Event map for SafeEmitter

export type SafeEmitterEventMap<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = IncludeOmnipresent extends true ? Merge<EventMap, OmnipresentEventData> : EventMap

// Event name type for SafeEmitter

export type SafeEmitterEventName<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = EventName<SafeEmitterEventMap<EventMap, IncludeOmnipresent>>

// EventListener type for SafeEmitter events

export type SafeEmitterListener<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  Name extends keyof SafeEmitterEventMap<EventMap, true> = keyof SafeEmitterEventMap<EventMap, true>,
> = (eventData: SafeEmitterEventMap<EventMap, true>[Name]) => Promisable<void>


// LoggedEmitter Types

// Event map for LoggedEmitter, includes omnipresent events
export type LoggedEmitterEventMap<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = IncludeOmnipresent extends true ? Merge<EventMap, OmnipresentEventData> : EventMap

// Event name type for LoggedEmitter
export type LoggedEmitterEventName<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = EventName<LoggedEmitterEventMap<EventMap, IncludeOmnipresent>>

// Listener type for LoggedEmitter events
export type LoggedEmitterListener<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  Name extends keyof LoggedEmitterEventMap<EventMap, true> = keyof LoggedEmitterEventMap<EventMap, true>,
> = (eventData: LoggedEmitterEventMap<EventMap, true>[Name]) => Promisable<void>


// MetricsEmitter Types

// Mapped type for metrics event data
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






// =============================================================================
// Additional Types from types.ts
// =============================================================================

import type { Args } from '@repo/types'
import type { ReadonlyDeep, Simplify, Tagged, LiteralUnion, IntRange } from 'type-fest'

// Error log entry type for listener errors (deeply immutable)
export type ListenerErrorLogEntry = ReadonlyDeep<{
  timestamp: number
  error: unknown
  listener: string
}>

// Event priority levels for better organization
export const EVENT_PRIORITIES = {
  CRITICAL: 1000,
  HIGH: 100,
  NORMAL: 0,
  LOW: -100,
  BACKGROUND: -1000,
} as const satisfies Record<string, number>

export type EventPriority = (typeof EVENT_PRIORITIES)[keyof typeof EVENT_PRIORITIES] & Priority

// Typed union of EVENT_PATTERNS keys for consumer use
export const EVENT_PATTERNS = {
  LIFECYCLE: /^(init|start|stop|destroy)$/,
  USER_ACTION: /^user\./,
  SYSTEM_EVENT: /^system\./,
  ERROR_EVENT: /^error\./,
  METRIC_EVENT: /^metric\./,
} as const
export type EventPatternKey = keyof typeof EVENT_PATTERNS

// Branded types for better type safety and domain modeling
export type TimeInMs = Tagged<number, 'TimeInMs'>
export type Count = Tagged<number, 'Count'>
export type EfficiencyRatio = Tagged<number, 'EfficiencyRatio'>
export type ErrorCount = Tagged<number, 'ErrorCount'>
export type EstimatedBytes = Tagged<number, 'Bytes'>
export type Priority = Tagged<number, 'Priority'>
export type ListenerId = Tagged<string, 'ListenerId'>
export type SchemaVersion = Tagged<string, 'SchemaVersion'>

// Valid listener names - either a function name or the anonymous marker
export type ListenerName = LiteralUnion<'<anonymous>', string>

// Efficiency threshold values with reasonable constraints
export type EfficiencyThreshold = IntRange<1, 10>

// DatalessEventNames<EventMap> extracts event names with no payload arguments
export type DatalessEventNames<EventMap> = {
  [K in keyof EventMap]: Extract<Args<EventMap[K]>, readonly []> extends never ? never : K
}[keyof EventMap]

// EventNamesExcludedByNever<EventMap> exposes event keys excluded from DatalessEventNames
export type EventNamesExcludedByNever<EventMap> = {
  [K in keyof EventMap]: Args<EventMap[K]> extends never ? K : never
}[keyof EventMap]

// ListenerPerformanceRecord for internal listener performance
export type ListenerPerformanceRecord = Simplify<
  ReadonlyDeep<{
    time: number
    listener: ListenerId
  }>
>

// ListenerCallback signature for event listeners
export type ListenerCallback<EventMap, EventName extends keyof EventMap> = (
  ...args: Args<EventMap[EventName]>
) => Promisable<void>

// ListenerFilter signature for conditional event handling
export type ListenerFilter<EventMap, EventName extends keyof EventMap> = (
  ...args: Args<EventMap[EventName]>
) => boolean

// PriorityListenerOptions for registering priority listeners
export type PriorityListenerOptions<EventMap, EventName extends keyof EventMap> = Simplify<{
  priority?: Priority
  filter?: ListenerFilter<EventMap, EventName>
}>

// PriorityListener configuration object
export type PriorityListener<EventMap, EventName extends keyof EventMap> = Simplify<{
  callback: ListenerCallback<EventMap, EventName>
  priority: Priority
  filter?: ListenerFilter<EventMap, EventName>
  sequence: number
}>

// ListenerState for event listener state tracking
export type ListenerState = 'registered' | 'active' | 'paused' | 'errored' | 'unsubscribed'

// UnsubscribeMeta for listener tracking and debugging
export type UnsubscribeMeta = {
  readonly state: ListenerState
  readonly callCount: Count
  readonly lastError?: Error | unknown
}

// EnhancedUnsubscribeFunction with state information
export type EnhancedUnsubscribeFunction = UnsubscribeFunction & UnsubscribeMeta