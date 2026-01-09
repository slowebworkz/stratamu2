import type { EmitteryUnsubscribeFunction } from "./index.ts"
import type { Tagged } from "type-fest"

export type Priority = Tagged<number, "Priority">

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

/**
 * Function returned when subscribing to an event.
 * Call it to unsubscribe from the event.
 */
export type UnsubscribeFunction = EmitteryUnsubscribeFunction
