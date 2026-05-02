import type Emittery from "emittery"
import type {
  DebugLogger,
  DebugOptions,
  DatalessEventNames,
  EmitteryOncePromise,
  EventName as EmitteryEventName,
  ListenerChangedData,
  Options as EmitteryOptions,
  UnsubscribeFunction,
} from "emittery"
import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { InternalEventMap } from "./index.ts"
import type { LiteralUnion, Simplify } from "type-fest"

/**
 * =====================================================
 * Re-export Emittery types for consistent external usage
 * =====================================================
 *
 * All code outside this module should import Emittery types
 * through this file. This allows future internal migration
 * or abstraction without changing imports everywhere.
 */
export type {
  DebugLogger as EmitteryDebugLogger,
  DebugOptions as EmitteryDebugOptions,
  DatalessEventNames,
  EmitteryEventName,
  EmitteryOncePromise,
  EmitteryOptions,
  ListenerChangedData,
  UnsubscribeFunction as EmitteryUnsubscribeFunction,
}

/**
 * =====================================================
 * Helper types for `.on()` method typing
 * =====================================================
 */

/**
 * Extracts the `.on()` method from an Emittery instance for a given EventMap.
 *
 * @template EventMap - The mapping of event keys to payloads.
 */
export type EmitteryOnMethod<EventMap extends BaseEventMap = BaseEventMap> =
  Emittery<EventMap>["on"]

/**
 * Tuple representing the parameters of the Emittery `.on()` method.
 * Typically: `[eventName, listener, options?]`
 *
 * @template EventMap - The event map defining available events.
 */
export type EmitteryOnParams<EventMap extends BaseEventMap = BaseEventMap> = Parameters<
  EmitteryOnMethod<EventMap>
>

/**
 * Extracts the listener function type from the `.on()` method parameters.
 *
 * @template EventMap - The event map defining available events.
 */
export type EmitteryOnListener<EventMap extends BaseEventMap = BaseEventMap> =
  EmitteryOnParams<EventMap>[1]

/**
 * Type-safe listener for a specific event key `Key` in a given EventMap.
 *
 * Uses the internal `SingleArgListener` type to unify listener signatures
 * across your SafeEmitter system. Ensures type safety for both user-defined
 * events and internal events like `InternalEventMap`.
 *
 * Supports both known event keys and arbitrary string keys via `LiteralUnion`,
 * allowing type-safe event registration with flexibility for dynamic event names.
 *
 * @template EventMap - Event map defining available events (defaults to `BaseEventMap`).
 * @template Key - Specific key of the event in EventMap, or any string (defaults to all known keys).
 */
export type EmitteryListenerFor<
  EventMap extends BaseEventMap = BaseEventMap,
  Key extends LiteralUnion<keyof EventMap, string> = LiteralUnion<keyof EventMap, string>,
> = Readonly<Simplify<SingleArgListener<EventMap, Key>>>

/**
 * =====================================================
 * Internal Event-specific listener helper
 * =====================================================
 *
 * Type-safe listener explicitly for internal/private events.
 * Use this when registering listeners for `InternalEventMap` keys
 * such as `INTERNAL_ON_LISTENER_ERROR` or `INTERNAL_ON_DESTROY`.
 *
 * Supports both known internal event keys and arbitrary string keys via `LiteralUnion`.
 *
 * @template EventMap - Base user event map that internal events are derived from.
 * @template Key - Specific internal event key, or any string (defaults to all known internal keys).
 *
 * @example
 * const internalListener: EmitteryInternalListenerFor<MyEventMap, typeof INTERNAL_ON_LISTENER_ERROR> =
 *   ([eventName, error, context]) => {
 *     console.error(`Listener error on ${eventName}:`, error)
 *   }
 */
export type EmitteryInternalListenerFor<
  EventMap extends BaseEventMap = BaseEventMap,
  Key extends keyof InternalEventMap<EventMap> | string = keyof InternalEventMap<EventMap> | string,
> = Readonly<
  Simplify<
    SingleArgListener<
      InternalEventMap<EventMap>,
      Key extends keyof InternalEventMap<EventMap> ? Key : never
    >
  >
>
