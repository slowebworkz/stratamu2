import type { BaseEventMap } from '@repo/types'
import type { Promisable, Simplify } from 'type-fest'

// Private event keys for internal error handling (Symbols for true privacy)
export const INTERNAL_ON_LISTENER_ERROR = Symbol('internal_on_listener_error')
export const INTERNAL_ON_EMIT_ERROR = Symbol('internal_on_emit_error')
export const INTERNAL_ON_REMOVE_WARN = Symbol('internal_on_remove_warn')
export const INTERNAL_ON_LISTENER_REMOVED = Symbol('internal_on_listener_removed')
export const INTERNAL_ON_CHILD_ERROR = Symbol('internal_on_child_error')
export const INTERNAL_ON_DESTROY = Symbol('internal_on_destroy')

// Centralized set of all internal/private event keys
const INTERNAL_EVENT_KEYS = new Set<PropertyKey>([
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_REMOVE_WARN,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_CHILD_ERROR,
  INTERNAL_ON_DESTROY,
])

// Exported helper to check if an event is internal/private
export function isInternalEvent(
  event: PropertyKey,
): event is
  | typeof INTERNAL_ON_LISTENER_ERROR
  | typeof INTERNAL_ON_EMIT_ERROR
  | typeof INTERNAL_ON_REMOVE_WARN
  | typeof INTERNAL_ON_LISTENER_REMOVED
  | typeof INTERNAL_ON_CHILD_ERROR
  | typeof INTERNAL_ON_DESTROY {
  return INTERNAL_EVENT_KEYS.has(event)
}

// Type guard: checks if an event is a public event (not internal/private)
export function isPublicEvent<EventMap extends BaseEventMap<unknown[]>>(
  event: PropertyKey,
): event is keyof EventMap {
  return !isInternalEvent(event)
}

// Internal event map for error events only
export type InternalEventMap<EventMap extends BaseEventMap<unknown[]>> = Simplify<{
  [INTERNAL_ON_LISTENER_ERROR]: [
    eventName: keyof EventMap,
    error: unknown,
    context: {
      type: 'on' | 'once'
      listener?: (...args: any[]) => Promisable<void>
      hasFilter?: boolean
    },
  ]
  [INTERNAL_ON_EMIT_ERROR]: [
    eventName: keyof EventMap,
    error: unknown,
    context?: { emitter?: unknown },
  ]
  [INTERNAL_ON_REMOVE_WARN]: [
    eventName: keyof EventMap,
    listener: (...args: any[]) => Promisable<void>,
    context?: { emitter?: unknown },
  ]
  [INTERNAL_ON_LISTENER_REMOVED]: [
    eventName: keyof EventMap,
    listener: (...args: any[]) => Promisable<void>,
    context?: { emitter?: unknown },
  ]
  [INTERNAL_ON_CHILD_ERROR]: [error: unknown, context?: { emitter?: unknown }]
  [INTERNAL_ON_DESTROY]: [emitter: unknown]
}>
