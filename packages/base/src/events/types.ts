import type { Args, BaseEventMap, EventKeyType, EventListenerFn, EventName } from '@repo/types'
import type { OmnipresentEventData, UnsubscribeFunction } from 'emittery'
import type { Level, Logger } from 'pino'
import type {
  IntRange,
  LiteralUnion,
  Merge,
  Promisable,
  ReadonlyDeep,
  Simplify,
  Tagged,
} from 'type-fest'
import type { Count } from '@/performance/types.js'

// ===============================
// Base Types
// ===============================

export type EventKey<T> = LiteralUnion<Extract<keyof T, string>, string>

export type Listener<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  Name extends keyof EventMap = keyof EventMap,
> = (eventData: EventMap[Name]) => Promisable<void>

export type FullEventMap<EventMap extends BaseEventMap<unknown> = BaseEventMap> = Merge<
  EventMap,
  OmnipresentEventData
>

export type FullEventName<EventMap extends BaseEventMap<unknown> = BaseEventMap> = EventName<
  FullEventMap<EventMap>
>

export type FullListener<
  EventMap extends BaseEventMap<unknown>,
  Name extends keyof FullEventMap<EventMap> = keyof FullEventMap<EventMap>,
> = Listener<FullEventMap<EventMap>, Name>

export type EventListener<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  Name extends keyof EventMap = keyof EventMap,
> = EventListenerFn<EventMap[Name]>

// ===============================
// SafeEmitter Types
// ===============================

export type SafeEmitterEventMap<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = IncludeOmnipresent extends true ? Merge<EventMap, OmnipresentEventData> : EventMap

export type SafeEmitterEventName<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = EventName<SafeEmitterEventMap<EventMap, IncludeOmnipresent>>

export type SafeEmitterListener<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  Name extends keyof SafeEmitterEventMap<EventMap, true> = keyof SafeEmitterEventMap<
    EventMap,
    true
  >,
> = (eventData: SafeEmitterEventMap<EventMap, true>[Name]) => Promisable<void>

// ===============================
// DRY utility for count-like records
// ===============================

export type CountsMap<
  K extends EventKeyType,
  Extra extends EventKeyType = never,
> = Record<K | Extra, number>

export type ListenerCounts<K extends EventKeyType> = CountsMap<K, 'total'>

export type ErrorCounts<K extends EventKeyType> = CountsMap<K>

export type LogSizes<K extends EventKeyType> = CountsMap<K, '__total'>

// ===============================
// Promise-like type for once() with cancellation
// ===============================

export type EmitteryOncePromise<T> = Promise<T> & { off: () => void }

// ===============================
// LoggedEmitter Types
// ===============================

export type LoggedEmitterEventMap<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = IncludeOmnipresent extends true ? Merge<EventMap, OmnipresentEventData> : EventMap

export type LoggedEmitterEventName<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = EventName<LoggedEmitterEventMap<EventMap, IncludeOmnipresent>>

export type LoggedEmitterListener<
  EventMap extends BaseEventMap<unknown> = BaseEventMap,
  Name extends keyof LoggedEmitterEventMap<EventMap, true> = keyof LoggedEmitterEventMap<
    EventMap,
    true
  >,
> = (eventData: LoggedEmitterEventMap<EventMap, true>[Name]) => Promisable<void>

// ===============================
// MetricsEmitter Types
// ===============================

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

// ===============================
// Logging/Emitter Types
// ===============================

export type PinoLogArgs = Parameters<Logger[Level]>

export type SafeMergingObject = { [key: string]: unknown; shouldThrow?: boolean }

export type ThrowConfig = { shouldThrow: true }

export type Bindings = Record<string, unknown>

export type ChildLoggerOptions = Record<string, unknown>

// ===============================
// Additional Types from types.ts
// ===============================

export type ListenerErrorLogEntry = ReadonlyDeep<{
  timestamp: number
  error: unknown
  listener: string
}>

export const EVENT_PRIORITIES = {
  CRITICAL: 1000,
  HIGH: 100,
  NORMAL: 0,
  LOW: -100,
  BACKGROUND: -1000,
} as const satisfies Record<string, number>

export type EventPriority = (typeof EVENT_PRIORITIES)[keyof typeof EVENT_PRIORITIES] & Priority

export const EVENT_PATTERNS = {
  LIFECYCLE: /^(init|start|stop|destroy)$/,
  USER_ACTION: /^user\./,
  SYSTEM_EVENT: /^system\./,
  ERROR_EVENT: /^error\./,
  METRIC_EVENT: /^metric\./,
} as const

export type EventPatternKey = keyof typeof EVENT_PATTERNS

export type EfficiencyRatio = Tagged<number, 'EfficiencyRatio'>

export type EstimatedBytes = Tagged<number, 'Bytes'>

export type Priority = Tagged<number, 'Priority'>

export type ListenerId = Tagged<string, 'ListenerId'>

export type SchemaVersion = Tagged<string, 'SchemaVersion'>

export type EfficiencyThreshold = IntRange<1, 10>

export type DatalessEventNames<EventMap> = {
  [K in keyof EventMap]: Extract<Args<EventMap[K]>, readonly []> extends never ? never : K
}[keyof EventMap]

export type EventNamesExcludedByNever<EventMap> = {
  [K in keyof EventMap]: Args<EventMap[K]> extends never ? K : never
}[keyof EventMap]

export type ListenerPerformanceRecord = Simplify<
  ReadonlyDeep<{
    time: number
    listener: ListenerId
  }>
>
export type ListenerCallback<EventMap, EventName extends keyof EventMap> = (
  ...args: Args<EventMap[EventName]>
) => Promisable<void>

export type ListenerFilter<EventMap, EventName extends keyof EventMap> = (
  ...args: Args<EventMap[EventName]>
) => boolean

export type PriorityListenerOptions<EventMap, EventName extends keyof EventMap> = Simplify<{
  priority?: Priority
  filter?: ListenerFilter<EventMap, EventName>
}>

export type PriorityListener<EventMap, EventName extends keyof EventMap> = Simplify<{
  callback: ListenerCallback<EventMap, EventName>
  priority: Priority
  filter?: ListenerFilter<EventMap, EventName>
  sequence: number
}>

export type ListenerState = 'registered' | 'active' | 'paused' | 'errored' | 'unsubscribed'

export type UnsubscribeMeta = {
  readonly state: ListenerState
  readonly callCount: Count
  readonly lastError?: Error | unknown
}

export type EnhancedUnsubscribeFunction = UnsubscribeFunction & UnsubscribeMeta
