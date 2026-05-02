import type { Simplify } from "type-fest"
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
 * Internal event types for error handling, lifecycle, and cleanup. Not user-facing.
 */

/**
 * All internal event keys (symbols).
 */
export type InternalEventKey = typeof INTERNAL_EVENT_KEYS extends ReadonlySet<infer T> ? T : never

/**
 * Optional context for internal listeners.
 */
type InternalEventMapContext = Partial<Record<"emitter", unknown>>

/**
 * Listener function for internal events.
 */
type InternalEventMapListener = AnyListenerFn

/**
 * Tuple for registering an internal listener.
 * @template Map User event map
 */
type EventListenerTuple<Map extends BaseEventMap> = [
  eventName: EventKey<Map>,
  listener?: InternalEventMapListener,
  context?: InternalEventMapContext,
]

/**
 * Maps internal event symbols to their payload arrays.
 * @template Map User event map
 */
export type InternalEventMap<Map extends BaseEventMap> = Simplify<{
  [INTERNAL_ON_LISTENER_ERROR]: [
    eventName: EventKey<Map>,
    error: unknown,
    context: ListenerErrorContext,
  ]
  // [INTERNAL_ON_EMIT_ERROR]: [
  //   eventName: EventKey<Map>,
  //   error: unknown,
  //   context?: InternalEventMapContext,
  // ]
  // [INTERNAL_ON_REMOVE_WARN]: EventListenerTuple<Map>
  // [INTERNAL_ON_LISTENER_REMOVED]: EventListenerTuple<Map>
  // [INTERNAL_ON_CHILD_ERROR]: [error: unknown, context?: InternalEventMapContext]
  // [INTERNAL_ON_DESTROY]: [emitter: unknown]
  // [INTERNAL_ON_DESTROY_ERROR]: [error: unknown, emitter: unknown]
}>

/**
 * Default internal event map for generic usage.
 */
export type DefaultInternalEventMap = InternalEventMap<BaseEventMap>

/**
 * Strongly-typed listeners for internal/private events.
 * Enforces correct payloads from InternalEventMap.
 */

/**
 * Type for all internal event keys for a given event map (not exported).
 * @template Map Base user event map
 */
type InternalEventMapKeys<Map extends BaseEventMap> = keyof InternalEventMap<Map>

/**
 * Type-safe listener for a specific internal event key.
 * @template Map Base user event map
 * @template Key Internal event key (from InternalEventKey)
 */
export type InternalListenerFor<
  Map extends BaseEventMap = BaseEventMap,
  Key extends InternalEventMapKeys<Map> = InternalEventMapKeys<Map>,
> = SingleArgListener<InternalEventMap<Map>, Key>
