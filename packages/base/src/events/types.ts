import type { LinkedList } from "@/data"
import type { Count } from "@/performance"
import type {
  AnyListenerFn,
  Args,
  BaseEventMap,
  EventKey,
  EventKeyType,
  EventName,
  FullListener,
  FullEventMap,
  Listener,
} from "@repo/types";
import type { OmnipresentEventData, UnsubscribeFunction } from "emittery"
import type { Level, Logger } from "pino"
import type {
  IntRange,
  JsonValue,
  LiteralUnion,
  Merge,
  Promisable,
  ReadonlyDeep,
  SetOptional,
  Simplify,
  Tagged,
} from "type-fest"
import {
  INTERNAL_ON_CHILD_ERROR,
  INTERNAL_ON_DESTROY,
  INTERNAL_ON_DESTROY_ERROR,
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_REMOVE_WARN,
  type LISTENER_STATES,
} from "./constants.ts"

// ===============================
// Base Types
// ===============================

// ===============================
// DRY utility for count-like records
// ===============================

export type CountsMap<K extends EventKeyType, Extra extends EventKeyType = never> = {
  [P in K]: number
} & Partial<Record<Extra, number>>

export type ListenerCounts<K extends EventKeyType> = CountsMap<K, "total">

export type ErrorCounts<K extends EventKeyType> = CountsMap<K>

export type LogSizes<K extends EventKeyType> = CountsMap<K, "__total">

// ===============================
// Promise-like types for once() with cancellation
// ===============================

/** Promise that may expose an optional `.off()` cancellation method. */
export type CancelablePromise<T> = Promise<T> & { off?: () => void }

/** Internal alias used for wrapped promises that may receive an `.off` binding. */
export type WrappedCancelable<T> = Promise<T> & { off?: () => void }

export type EmitteryOncePromise<T> = Omit<Promise<T>, "finally"> & {
  off(): void
  finally: Promise<T>["finally"]
}

// ===============================
// SafeEmitter Types
// ===============================

export type EventMetrics<EventMap extends BaseEventMap = BaseEventMap> = {
  listenerCounts: ListenerCounts<EventKey<EventMap>>
  safety: {
    errorCounts: ErrorCounts<EventKey<EventMap>>
    logSizes: LogSizes<EventKey<EventMap>>
    capacity: number
    enabled: boolean
  }
}

export type ReadonlyEventMetrics<EventMap extends BaseEventMap = BaseEventMap> = ReadonlyDeep<
  EventMetrics<EventMap>
>

/**
 * Utility type: If EventName<EventMap> is a string, use it; otherwise, fall back to string.
 */
export type EventNameString<
  EventMap extends Record<string, unknown[]>
> =
  EventName<EventMap> extends string
  ? EventName<EventMap>
  : string

/**
 * Performance level classification for event metrics.
 */
export type PerformanceLevel = "excellent" | "good" | "concerning" | "poor"

// ===============================
// Default Internal Event Map
// ===============================

export type DefaultInternalEventMap = InternalEventMap<Record<string, unknown[]>>

// ===============================
// LoggedEmitter Types
// ===============================

export type LoggedEmitterEventMap<
  EventMap extends BaseEventMap = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = IncludeOmnipresent extends true ? Merge<EventMap, OmnipresentEventData> : EventMap

export type LoggedEmitterEventName<
  EventMap extends BaseEventMap = BaseEventMap,
  IncludeOmnipresent extends boolean = true,
> = EventName<LoggedEmitterEventMap<EventMap, IncludeOmnipresent>>

export type LoggedEmitterListener<
  EventMap extends BaseEventMap = BaseEventMap,
  Name extends keyof LoggedEmitterEventMap<EventMap, true> = keyof LoggedEmitterEventMap<
    EventMap,
    true
  >,
> = (eventData: LoggedEmitterEventMap<EventMap, true>[Name]) => Promisable<void>

// ===============================
// Private events
// ===============================

type InternalEventMapListener = AnyListenerFn
type InternalEventMapContext = Partial<Record<"emitter", unknown>>

export type InternalEventMap<EventMap extends BaseEventMap> = Simplify<{
  [INTERNAL_ON_LISTENER_ERROR]: [
    eventName: keyof EventMap,
    error: unknown,
    context: ListenerErrorContext,
  ]
  [INTERNAL_ON_EMIT_ERROR]: [
    eventName: keyof EventMap,
    error: unknown,
    context?: InternalEventMapContext,
  ]
  [INTERNAL_ON_REMOVE_WARN]: [
    eventName: keyof EventMap,
    listener: InternalEventMapListener,
    context?: InternalEventMapContext,
  ]
  [INTERNAL_ON_LISTENER_REMOVED]: [
    eventName: keyof EventMap,
    listener: InternalEventMapListener,
    context?: InternalEventMapContext,
  ]
  [INTERNAL_ON_CHILD_ERROR]: [error: unknown, context?: InternalEventMapContext]
  [INTERNAL_ON_DESTROY]: [emitter: unknown]
  [INTERNAL_ON_DESTROY_ERROR]: [error: unknown, emitter: unknown]
}>

/**
 * Combines user event map and internal event map for type-safe event handling.
 *
 * @template EventMap extends BaseEventMap
 */
export type AllEvents<EventMap extends BaseEventMap> = EventMap & InternalEventMap<EventMap>

// ===============================
// AllEventKeys Type
// ===============================

export type AllEventKeys<EventMap extends BaseEventMap> = keyof AllEvents<EventMap>

// ===============================
// Logging/Emitter Types
// ===============================

export type PinoLogArgs = Parameters<Logger[Level]>

export type SafeMergingObject = {
  [key: string]: unknown
  shouldThrow?: boolean
}

export type ThrowConfig = { shouldThrow: true }

export type Bindings = Record<string, unknown>

export type ChildLoggerOptions = Record<string, unknown>

// ===============================
// Additional Types from types.ts
// ===============================

/**
 * Utility type to extract the payload type from a tuple.
 *
 * @template T extends any[]
 */
export type ExtractPayload<T> = T extends [infer U] ? U : never

/** Developer-friendly helper: the public (string-named) events map simplified for IDEs. */
export type PublicEventMap<EventMap extends BaseEventMap> = Simplify<
  Pick<AllEvents<EventMap>, Extract<keyof AllEvents<EventMap>, string>> & {
    resetErrorCounts: [eventName?: string]
    clearSafetyLogs: [eventName?: string]
    enableSafeMode: [enabled: boolean]
  }
>

/** Developer-friendly union type for public event names (string literals + arbitrary strings). */
export type PublicEventName<E> = LiteralUnion<Extract<keyof E, string>, string>

export type ListenerErrorContext<Emitter = unknown> = {
  type: "on" | "once"
  listener?: AnyListenerFn
  hasFilter?: boolean
  emitter?: Emitter
}

export type ListenerErrorLogEntry = ReadonlyDeep<{
  timestamp: number
  error: unknown
  listener: string
}>

export type EfficiencyRatio = Tagged<number, "EfficiencyRatio">

export type EstimatedBytes = Tagged<number, "Bytes">

export type Priority = Tagged<number, "Priority">

export type ListenerId = Tagged<string, "ListenerId">

export type SchemaVersion = Tagged<string, "SchemaVersion">

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

export type ListenerState = (typeof LISTENER_STATES)[number]

export type UnsubscribeMeta = {
  readonly state: ListenerState
  readonly callCount: Count
  readonly lastError?: Error | unknown
}

export type EnhancedUnsubscribeFunction = UnsubscribeFunction & UnsubscribeMeta

/**
 * Deeply readonly record type for event constants.
 * @template K - key type (e.g., string, Uppercase<string>)
 * @template V - value type (e.g., number, RegExp)
 */
export type DeepReadonlyRecord<K extends string, V = unknown> = ReadonlyDeep<Record<K, V>>

// ===============================
// SafetyEmitter Types
// ===============================

/**
 * Options used to configure the standalone safety manager.
 *
 * Generic by EventMap so `perEventCap` can be keyed by actual event names.
 */
export type PerEventCap<EventMap extends BaseEventMap = BaseEventMap> = Partial<
  Record<EventKey<EventMap>, number>
>

export type SafetyEmitterOptions<EventMap extends BaseEventMap = BaseEventMap> = {
  safetyLogCap?: number
  sanitizeErrors?: boolean
  enabled?: boolean
  perEventCap?: PerEventCap<EventMap>
}

/**
 * Sanitized error shapes. Either a trimmed Error-like shape, a stringified
 * representation, or any JSON-friendly value.
 */

export type SanitizedError =
  | { kind: "Error"; name: string; message: string; stackSnippet?: string }
  | { kind: "String"; value: string }
  | { kind: "Json"; value: JsonValue }

export type SafetyLogEntry = {
  timestamp: number
  error: unknown
  listener: string
}

export type LogQueryOptions = {
  limit?: number
  newestFirst?: boolean
}

// ===============================
// Filtered Priority Emitter Type Aliases
// ===============================

/** Emitter Event key type supporting string unions */
export type EmitterEventKey<EventMap> = EventKey<EventMap>

/** Linked list of listeners for an event */
export type ListenerList<EventMap, Name extends keyof EventMap> = LinkedList<
  PriorityListener<EventMap, Name>
>

/** Map of event keys to listener lists */
export type PriorityListenerMap<EventMap> = Map<
  EmitterEventKey<EventMap>,
  LinkedList<PriorityListener<EventMap, keyof EventMap>>
>

/** Event argument tuple type */
export type EventArgs<EventMap, Name extends keyof EventMap> = Args<EventMap[Name]>

/** Error handler callback for listeners */
export type ListenerErrorHandler<EventMap, Name extends keyof EventMap> = (
  event: Name,
  err: unknown,
  name: string,
) => void

/** Emit options with optional skipBaseListeners flag */
export type EmitOptions = SetOptional<{ skipBaseListeners: boolean }, "skipBaseListeners">

/** Readonly deep copy of a priority listener for registration */
export type RegisteredListener<EventMap, EventName extends keyof EventMap> = ReadonlyDeep<
  PriorityListener<EventMap, EventName>
>

// ===============================
// Priority Listener Types (from filtered-priority-emitter)
// ===============================

export interface BasePriorityListener<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
> {
  callback: (...args: Args<EventMap[EventName]>) => Promisable<void>
  priority: Priority
  sequence: number
  filter?: (...args: Args<EventMap[EventName]>) => boolean
}

export type UnsafeListenerListCast<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
> = ListenerList<EventMap, EventName>
