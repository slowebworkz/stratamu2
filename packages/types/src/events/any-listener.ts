import type { BaseEventMap, EmitteryOnListener } from "@/events"

/**
 * Generic Emittery-compatible listener for any event.
 *
 * - single argument (event payload)
 * - payload may be anything (including tuples)
 * - return type matches Emittery expectations
 */
export type AnyListenerFn = EmitteryOnListener<BaseEventMap>
