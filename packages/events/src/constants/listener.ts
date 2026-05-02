// ===============================
// Listener Configuration
// ===============================

/**
 * Possible states for event listeners throughout their lifecycle.
 * - registered: Listener is registered but not yet active
 * - active: Listener is currently active and will be called
 * - paused: Listener is temporarily inactive
 * - errored: Listener encountered an error
 * - unsubscribed: Listener has been removed
 */
export const LISTENER_STATES = [
  "registered",
  "active",
  "paused",
  "errored",
  "unsubscribed",
] as const

/**
 * Type-safe literal union of all listener states.
 */
export type ListenerState = (typeof LISTENER_STATES)[number]
