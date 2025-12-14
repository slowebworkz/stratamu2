import type { LinkedList } from "@/data"
import type {
  ENTITY_STATES,
  ENTITY_TYPES,
  EVENT_PRIORITIES,
  INTERNAL_ON_CHILD_ERROR,
  INTERNAL_ON_DESTROY,
  INTERNAL_ON_DESTROY_ERROR,
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_REMOVE_WARN,
  LISTENER_STATES,
} from "@/events"
import type { Count } from "@/performance"
import type {
  AnyListenerFn,
  Args,
  BaseEventMap,
  EmitterEventKey,
  EventKeyType,
  EventName,
  ListenerErrorContext,
} from "@repo/types"
import type { EmitteryOncePromise, OmnipresentEventData, UnsubscribeFunction } from "emittery"
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

// ===============================
// DRY utility for count-like records
// ===============================

export type CountsMap<
  RequiredKeys extends EventKeyType,
  OptionalKeys extends EventKeyType = never,
> = Simplify<{ [P in RequiredKeys]: number } & Partial<Record<OptionalKeys, number>>>

export type ListenerCounts<T> = CountsMap<EmitterEventKey<T>, "total">

export type ErrorCounts<T> = CountsMap<EmitterEventKey<T>>

export type LogSizes<T> = CountsMap<EmitterEventKey<T>, "__total">

// ===============================
// Function Types for Cleanup/Disposal
// ===============================

/**
 * Function that disposes/cleans up resources (listeners, subscriptions, etc.).
 * Returned by `.on()`, `.once()`, and other registration methods.
 */
export type DisposerFn = () => void

/**
 * Function that cancels an in-flight async operation.
 * Used by cancelable promises to abort before completion.
 */
export type CancelFn = () => void

/**
 * Options for listener subscription methods (`.on()`, `.once()`).
 * Supports aborting the subscription via AbortSignal.
 */
export type SubscriptionOptions = {
  signal?: AbortSignal
  /** Register as one-shot: auto-dispose after first call */
  once?: boolean
  /** Optional listener priority (used by priority-aware emitters) */
  priority?: Priority
}

// ===============================
// Promise-like types for once() with cancellation
// ===============================

/**
 * Promise that may expose an optional `.off()` cancellation method.
 */
export type CancelablePromise<T> = Promise<T> & {
  readonly off: CancelFn
}

/**
 * Internal alias used for wrapped promises that may receive an `.off` binding.
 */
export type WrappedCancelable<T> = Promise<T> & {
  off?: CancelFn
}

export type SafeOncePromise<
  EventMap extends BaseEventMap,
  K extends AllEventKeys<EventMap>,
> = EmitteryOncePromise<(AllEvents<EventMap> & OmnipresentEventData)[K]>

export type EmitArgs<EventMap, K extends keyof EventMap> = Tuplefy<EventMap[K]>

// ===============================
// SafeEmitter Types
// ===============================

export type EventMetrics<EventMap extends BaseEventMap = BaseEventMap> = {
  listenerCounts: ListenerCounts<EventMap>
  safety: {
    errorCounts: ErrorCounts<EventMap>
    logSizes: LogSizes<EventMap>
    capacity: number
    enabled: boolean
  }
}

export type ReadonlyEventMetrics<EventMap extends BaseEventMap = BaseEventMap> = ReadonlyDeep<
  EventMetrics<EventMap>
>

export type Tuplefy<T> = T extends undefined
  ? readonly []
  : T extends readonly [...unknown[]] // preserve tuple / readonly tuple
    ? T
    : readonly [T]

// ===============================
// Default Internal Event Map
// ===============================

export type DefaultInternalEventMap = InternalEventMap<BaseEventMap>

// ===============================
// LoggedEmitter Types
// ===============================

/**
 * String keys of the logged emitter event map (including omnipresent events).
 */
export type LoggedEmitterEventKey<EventMap extends BaseEventMap = BaseEventMap> = EmitterEventKey<
  LoggedEmitterEventMap<EventMap, true>
>

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
  Name extends LoggedEmitterEventName<EventMap> = LoggedEmitterEventName<EventMap>,
> = (
  eventData: LoggedEmitterEventMap<EventMap, true>[Extract<
    Name,
    keyof LoggedEmitterEventMap<EventMap, true>
  >],
) => Promisable<void>

// ===============================
// Private events
// ===============================

type EventListenerTuple<EventMap extends BaseEventMap> = [
  eventName: EmitterEventKey<EventMap>,
  listener?: InternalEventMapListener,
  context?: InternalEventMapContext,
]

type InternalEventMapListener = AnyListenerFn

type InternalEventMapContext = Partial<Record<"emitter", unknown>>

/* export type InternalEventMap<EventMap extends BaseEventMap> = {
  [K in keyof InternalEventMapShape<EventMap>]:
    InternalEventMapShape<EventMap>[K]
} */

export type InternalEventMap<EventMap extends BaseEventMap> = Simplify<{
  [INTERNAL_ON_LISTENER_ERROR]: [
    eventName: EmitterEventKey<EventMap>,
    error: unknown,
    context: ListenerErrorContext,
  ]
  [INTERNAL_ON_EMIT_ERROR]: [
    eventName: EmitterEventKey<EventMap>,
    error: unknown,
    context?: InternalEventMapContext,
  ]
  [INTERNAL_ON_REMOVE_WARN]: EventListenerTuple<EventMap>
  [INTERNAL_ON_LISTENER_REMOVED]: EventListenerTuple<EventMap>
  [INTERNAL_ON_CHILD_ERROR]: [error: unknown, context?: InternalEventMapContext]
  [INTERNAL_ON_DESTROY]: [emitter: unknown]
  [INTERNAL_ON_DESTROY_ERROR]: [error: unknown, emitter: unknown]
}>

// ===============================
// AllEvents and AllEventKeys Type
// ===============================

/**
 * Combines user event map and internal event map for type-safe event handling.
 *
 * @template EventMap extends BaseEventMap
 */
export type AllEvents<EventMap extends BaseEventMap> = EventMap & InternalEventMap<EventMap>

export type AllEventKeys<EventMap extends BaseEventMap> = EmitterEventKey<AllEvents<EventMap>>

// ===============================
// Logging/Emitter Types
// ===============================

export type PinoLogArgs = Parameters<Logger[Level]>

export type SafeMergingObject = Simplify<
  Record<string, unknown> & {
    shouldThrow?: boolean
  }
>

export type ThrowConfig = { shouldThrow: true }

export type Bindings = Record<string, unknown>

export type ChildLoggerOptions = Record<string, unknown>

// ===============================
// Additional Types from types.ts
// ===============================

type StringKeys<T> = Extract<keyof T, string>

type OptionalArg<T = unknown> = [arg?: T]

/** Developer-friendly helper: the public (string-named) events map simplified for IDEs. */
export type PublicEventMap<EventMap extends BaseEventMap> = Simplify<
  Pick<AllEvents<EventMap>, StringKeys<AllEvents<EventMap>>> & {
    resetErrorCounts: OptionalArg<string>
    clearSafetyLogs: OptionalArg<string>
    enableSafeMode: [enabled: boolean]
  }
>

/** Developer-friendly union type for public event names (string literals + arbitrary strings). */
export type PublicEventName<EventMap extends BaseEventMap> = LiteralUnion<
  StringKeys<PublicEventMap<EventMap>>,
  string
>

export type EfficiencyRatio = Tagged<number, "EfficiencyRatio">

export type EstimatedBytes = Tagged<number, "Bytes">

export type Priority = Tagged<number, "Priority">

/** Type for event priority keys (for use in APIs, etc.) */
export type EventPriorityKey = LiteralUnion<keyof typeof EVENT_PRIORITIES, string>

export type EntityTypeKey = LiteralUnion<(typeof ENTITY_TYPES)[number], string>
export type EntityStateKey = LiteralUnion<(typeof ENTITY_STATES)[number], string>

export type ListenerId = Tagged<string, "ListenerId">

export type SchemaVersion = Tagged<string, "SchemaVersion">

export type EfficiencyThreshold = IntRange<1, 10>

export type DatalessEventNames<EventMap extends BaseEventMap> = {
  [K in EmitterEventKey<EventMap>]: Extract<Args<EventMap[K]>, [] | readonly []> extends never
    ? never
    : K
}[EmitterEventKey<EventMap>]

export type EventNamesExcludedByNever<EventMap extends BaseEventMap> = {
  [K in EmitterEventKey<EventMap>]: Args<EventMap[K]> extends never ? K : never
}[EmitterEventKey<EventMap>]

export type ListenerPerformanceRecord = Simplify<
  ReadonlyDeep<{
    time: number
    listener: ListenerId
  }>
>

// ===============================
// Listener Types
// ===============================

export type ListenerCallback<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
> = (...args: Args<EventMap[EventName]>) => Promisable<void>

export type ListenerFilter<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
> = (...args: Args<EventMap[EventName]>) => boolean

export type PriorityListenerOptions<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
> = Simplify<{
  priority?: Priority
  filter?: ListenerFilter<EventMap, EventName>
}>

export type PriorityListener<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
> = Simplify<{
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

export type EnhancedUnsubscribeFunction = Simplify<UnsubscribeFunction & UnsubscribeMeta>

/** Error handler callback for listeners */
export type ListenerErrorHandler<
  EventMap extends BaseEventMap,
  Name extends EmitterEventKey<EventMap>,
> = (event: Name, err: unknown, name: string) => void

/**
 * Emit options with optional skipBaseListeners flag
 */
export type EmitOptions = SetOptional<{ skipBaseListeners: boolean }, "skipBaseListeners">

/**
 * Readonly deep copy of a priority listener for registration
 */
export type RegisteredListener<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
> = ReadonlyDeep<PriorityListener<EventMap, EventName>>

/**
 * Extract the first argument type from an EventMap entry
 */
export type FirstEventArg<T> = T extends readonly [infer First, ...unknown[]] ? First : T

// ===============================
// SafetyEmitter Types
// ===============================

/**
 * Options used to configure the standalone safety manager.
 *
 * Generic by EventMap so `perEventCap` can be keyed by actual event names.
 */
export type PerEventCap<EventMap extends BaseEventMap = BaseEventMap> = Simplify<
  Partial<Record<EmitterEventKey<EventMap>, number>>
>

export type SafetyEmitterOptions<EventMap extends BaseEventMap = BaseEventMap> = Readonly<{
  safetyLogCap?: number
  sanitizeErrors?: boolean
  enabled?: boolean
  perEventCap?: PerEventCap<EventMap>
}>

/**
 * Sanitized error shapes. Either a trimmed Error-like shape, a stringified representation, or any JSON-friendly value.
 */
export type SanitizedError =
  | Readonly<{
      kind: "Error"
      name: string
      message: string
      stackSnippet?: string
    }>
  | Readonly<{ kind: "String"; value: string }>
  | Readonly<{ kind: "Json"; value: Exclude<JsonValue, undefined> }>

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

/**
 * Linked list of listeners for an event
 */
export type ListenerList<
  EventMap extends BaseEventMap,
  Name extends EmitterEventKey<EventMap>,
> = LinkedList<RegisteredListener<EventMap, Name>>

/**
 * Map of event keys to listener lists
 */
export type PriorityListenerMap<EventMap extends BaseEventMap> = Map<
  EmitterEventKey<EventMap>,
  LinkedList<RegisteredListener<EventMap, EmitterEventKey<EventMap>>>
>

/**
 * Event argument tuple type
 */
export type EventArgs<
  EventMap extends BaseEventMap,
  Name extends EmitterEventKey<EventMap>,
> = Simplify<Args<EventMap[Name]>>

export type UnsafeListenerListCast<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
> = Simplify<ListenerList<EventMap, EventName>>

// ===============================
// Priority Listener Types (from filtered-priority-emitter)
// ===============================

export interface BasePriorityListener<
  EventMap extends BaseEventMap,
  EventName extends EmitterEventKey<EventMap>,
> {
  readonly callback: ListenerCallback<EventMap, EventName>
  readonly priority: Priority
  readonly sequence: number
  readonly filter?: ListenerFilter<EventMap, EventName>
}
