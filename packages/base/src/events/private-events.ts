import type { BaseEventMap } from '@repo/types'
import { nanoid } from 'nanoid'
import type { Promisable } from 'type-fest'

// Generate a random namespace for private events (constant for process lifetime)
const PRIVATE_EVENT_NAMESPACE = nanoid(12)

// Private event keys for internal error handling (long, namespaced, randomizable)
export const INTERNAL_ON_LISTENER_ERROR = `__internal__on_listener_error__${PRIVATE_EVENT_NAMESPACE}`
export const INTERNAL_ON_EMIT_ERROR = `__internal__on_emit_error__${PRIVATE_EVENT_NAMESPACE}`

// Internal event map for error events only
export type InternalEventMap<EventMap extends BaseEventMap<unknown[]>> = {
  [INTERNAL_ON_LISTENER_ERROR]: [
    eventName: keyof EventMap,
    error: unknown,
    context: {
      type: 'on' | 'once'
      listener?: (...args: any[]) => Promisable<void>
      hasFilter?: boolean
    },
  ]
  [INTERNAL_ON_EMIT_ERROR]: [eventName: keyof EventMap, error: unknown]
}
