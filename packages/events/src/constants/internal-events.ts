// ===============================
// Internal Event Symbols
// ===============================

import type { InternalEventKey } from "../types/index.ts"

/**
 * Internal event fired when a listener encounters an error during execution.
 */
export const INTERNAL_ON_LISTENER_ERROR = Symbol("internal_on_listener_error")

/**
 * Internal event fired when an emit operation encounters an error.
 */
export const INTERNAL_ON_EMIT_ERROR = Symbol("internal_on_emit_error")

/**
 * Internal event fired when attempting to remove a non-existent listener.
 */
export const INTERNAL_ON_REMOVE_WARN = Symbol("internal_on_remove_warn")

/**
 * Internal event fired when a listener is successfully removed.
 */
export const INTERNAL_ON_LISTENER_REMOVED = Symbol("internal_on_listener_removed")

/**
 * Internal event fired when a child emitter encounters an error.
 */
export const INTERNAL_ON_CHILD_ERROR = Symbol("internal_on_child_error")

/**
 * Internal event fired when the emitter is destroyed.
 */
export const INTERNAL_ON_DESTROY = Symbol("internal_on_destroy")

/**
 * Internal event fired when an error occurs during emitter destruction.
 */
export const INTERNAL_ON_DESTROY_ERROR = Symbol("internal_on_destroy_error")

/**
 * Internal event for enabling metrics collection.
 */
export const INTERNAL_ENABLE_METRICS = Symbol("internal_enable_metrics")

/**
 * Array of all internal event symbols.
 * Single source of truth for internal events.
 */
const INTERNAL_EVENT_SYMBOLS = [
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_REMOVE_WARN,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_CHILD_ERROR,
  INTERNAL_ON_DESTROY,
  INTERNAL_ON_DESTROY_ERROR,
  INTERNAL_ENABLE_METRICS,
] as const

/**
 * Set of all internal event symbols.
 * Used for validation and filtering of internal events.
 */
export const INTERNAL_EVENT_KEYS = new Set(INTERNAL_EVENT_SYMBOLS)

/**
 * Set of internal error event symbols.
 * Used to identify error-related internal events for special handling.
 */
export const INTERNAL_ERROR_EVENTS: ReadonlySet<InternalEventKey> = new Set([
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_CHILD_ERROR,
  INTERNAL_ON_DESTROY_ERROR,
])
