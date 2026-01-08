import type { AnyListenerFn } from "@repo/types"

/**
 * Context information about an error that occurred during listener execution or subscription.
 */
export type ListenerErrorContext<Emitter = unknown> = {
  /**
   * The type of operation that was occurring when the error happened.
   */
  type: "on" | "once"

  /**
   * The listener function that was involved (if known).
   */
  listener?: AnyListenerFn

  /**
   * Whether the listener had a filter applied.
   */
  hasFilter?: boolean

  /**
   * Reference to the emitter instance where the error occurred.
   */
  emitter?: Emitter
}

/**
 * Log entry for a listener error.
 * Records details about errors that occur during listener execution.
 */
export type ListenerErrorLogEntry<Emitter = unknown> = {
  /**
   * The error that was caught.
   */
  error: Error

  /**
   * Context information about where/when the error occurred.
   */
  context: ListenerErrorContext<Emitter>

  /**
   * Timestamp when the error was logged.
   */
  timestamp: number

  /**
   * Optional stack trace string.
   */
  stack?: string
}
