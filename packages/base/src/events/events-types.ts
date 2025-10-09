import type { BaseEventMap } from '@repo/types'
import type Emittery from 'emittery'
import type { LiteralUnion, Simplify } from 'type-fest'
import type { InternalEventMap } from './private-events.js'

/**
 * Combines user event map and internal event map for type-safe event handling.
 *
 * @template EventMap extends BaseEventMap<unknown[]>
 */
export type AllEvents<EventMap extends BaseEventMap<unknown[]>> = EventMap &
  InternalEventMap<EventMap>

/**
 * Utility type to extract the payload type from a tuple.
 *
 * @template T extends any[]
 */
export type ExtractPayload<T> = T extends [infer U] ? U : never

/** Developer-friendly helper: the public (string-named) events map simplified for IDEs. */
export type PublicEventMap<EventMap extends BaseEventMap<unknown[]>> = Simplify<
  Pick<AllEvents<EventMap>, Extract<keyof AllEvents<EventMap>, string>> & {
    resetErrorCounts: [eventName?: string]
    clearSafetyLogs: [eventName?: string]
    enableSafeMode: [enabled: boolean]
  }
>

/** Developer-friendly union type for public event names (string literals + arbitrary strings). */
export type PublicEventName<E> = LiteralUnion<Extract<keyof E, string>, string>

/**
 * Internal helper to obtain the typed internal public bus from an emitter instance.
 * This centralizes the cast so subclasses can access a typed bus without leaking
 * internal symbol types into exported class signatures.
 */
/**
 * Return a typed internal public bus that only exposes string-named events.
 * This prevents symbol-typed internal event keys from leaking into exported
 * signatures while still allowing subclasses to register string-named control
 * listeners safely.
 */
export function internalPublicBus<EventMap extends BaseEventMap<unknown[]>>(
  self: unknown,
): Emittery<
  // Base events exposed to subclasses: all public (string) events from the
  // combined AllEvents map, plus a small set of string-named private control
  // events used by `SafetyEmitter` for administrative actions.
  Pick<AllEvents<EventMap>, Extract<keyof AllEvents<EventMap>, string>> & {
    resetErrorCounts: [eventName?: string]
    clearSafetyLogs: [eventName?: string]
    enableSafeMode: [enabled: boolean]
  }
> {
  return (self as any)._public as Emittery<
    Pick<AllEvents<EventMap>, Extract<keyof AllEvents<EventMap>, string>> & {
      resetErrorCounts: [eventName?: string]
      clearSafetyLogs: [eventName?: string]
      enableSafeMode: [enabled: boolean]
    }
  >
}
