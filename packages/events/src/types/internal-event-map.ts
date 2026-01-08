import type { Simplify, LiteralUnion } from "type-fest"
import type {
  AnyListenerFn,
  BaseEventMap,
  EventKey,
  ListenerErrorContext,
  SingleArgListener,
} from "@repo/types"
import type { OmnipresentEventData } from "emittery"
import type {
  INTERNAL_ON_CHILD_ERROR,
  INTERNAL_ON_DESTROY,
  INTERNAL_ON_DESTROY_ERROR,
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_REMOVE_WARN,
  INTERNAL_EVENT_KEYS,
} from "../constants/index.ts"

/**
 * ===============================
 * Internal Event Types
 * ===============================
 *
 * Private/system events used internally by the event emitter.
 * These events are not exposed to users; they are for error handling,
 * lifecycle management, and internal cleanup.
 */

/**
 * Union type of all internal event keys (symbols)
 */
export type InternalEventKey = typeof INTERNAL_EVENT_KEYS extends ReadonlySet<infer T> ? T : never

/** Optional context passed to internal listeners */
type InternalEventMapContext = Partial<Record<"emitter", unknown>>

/** Listener function type for internal events */
type InternalEventMapListener = AnyListenerFn

/**
 * Standard tuple for internal listener registration.
 *
 * @template EventMap - The user-defined event map
 */
type EventListenerTuple<EventMap extends BaseEventMap> = [
  eventName: EventKey<EventMap>,
  listener?: InternalEventMapListener,
  context?: InternalEventMapContext,
]

/**
 * Internal event map structure.
 * Maps internal event symbols to their payload arrays.
 *
 * @template EventMap - The user-defined event map
 */
export type InternalEventMap<EventMap extends BaseEventMap> = Simplify<{
  [INTERNAL_ON_LISTENER_ERROR]: [
    eventName: EventKey<EventMap>,
    error: unknown,
    context: ListenerErrorContext,
  ]
  [INTERNAL_ON_EMIT_ERROR]: [
    eventName: EventKey<EventMap>,
    error: unknown,
    context?: InternalEventMapContext,
  ]
  [INTERNAL_ON_REMOVE_WARN]: EventListenerTuple<EventMap>
  [INTERNAL_ON_LISTENER_REMOVED]: EventListenerTuple<EventMap>
  [INTERNAL_ON_CHILD_ERROR]: [error: unknown, context?: InternalEventMapContext]
  [INTERNAL_ON_DESTROY]: [emitter: unknown]
  [INTERNAL_ON_DESTROY_ERROR]: [error: unknown, emitter: unknown]
}>

/**
 * Default internal event map for generic usage
 */
export type DefaultInternalEventMap = InternalEventMap<BaseEventMap>

/**
 * ===============================
 * Combined Event Map Types
 * ===============================
 *
 * Types for working with both user-defined and internal events together.
 */

/**
 * Full combined event map (user + internal).
 * Ensures type-safe access to any event.
 *
 * @template EventMap - User-defined events.
 */
export type AllEvents<EventMap extends BaseEventMap> = EventMap & InternalEventMap<EventMap>

/**
 * Union of all event keys (user + internal).
 * Useful for iteration, validation, or dynamic access.
 *
 * @template EventMap - User-defined events.
 */
export type AllEventKeys<EventMap extends BaseEventMap> = EventKey<AllEvents<EventMap>>

/**
 * ===============================
 * Public Event Types
 * ===============================
 *
 * Types for the public-facing API that excludes internal/private events.
 */

/** Extract only string keys from an object */
type StringKeys<T> = Extract<keyof T, string>

/** Optional single-argument tuple helper */
type OptionalArg<T = unknown> = [arg?: T]

/**
 * Developer-friendly map of public events.
 * Combines:
 * - All user-defined events with string keys
 * - Public control events: resetErrorCounts, clearSafetyLogs, enableSafeMode
 *
 * @template EventMap - User-defined event map
 */
export type PublicEventMap<EventMap extends BaseEventMap> = Simplify<
  Pick<AllEvents<EventMap>, StringKeys<AllEvents<EventMap>>> & {
    resetErrorCounts: OptionalArg<string>
    clearSafetyLogs: OptionalArg<string>
    enableSafeMode: [enabled: boolean]
  }
>

/**
 * Union type of all public event names.
 * Includes string-named events + arbitrary strings for dynamic events.
 *
 * @template EventMap - User-defined event map
 */
export type PublicEventName<EventMap extends BaseEventMap> = LiteralUnion<
  StringKeys<PublicEventMap<EventMap>>,
  string
>

/**
 * ===============================
 * Internal Listener Helper Types
 * ===============================
 *
 * Strongly-typed listeners specifically for internal/private events.
 * Enforces correct payloads based on InternalEventMap.
 */

/**
 * Type-safe listener for a specific internal event key.
 *
 * Ensures the listener receives the correct payload type for that internal event.
 *
 * @template EventMap - Base user event map that internal events are derived from
 * @template Key - Specific internal event key (restricted to InternalEventKey)
 *
 * @example
 * const listener: InternalListenerFor<MyEventMap, typeof INTERNAL_ON_LISTENER_ERROR> =
 *   ([eventName, error, context]) => {
 *     console.error(`Listener error on ${eventName}:`, error)
 *   }
 */
export type InternalListenerFor<
  EventMap extends BaseEventMap = BaseEventMap,
  Key extends keyof InternalEventMap<EventMap> = keyof InternalEventMap<EventMap>,
> = SingleArgListener<InternalEventMap<EventMap>, Key>
