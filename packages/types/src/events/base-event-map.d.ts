// Canonical event map type for event emitters in the base package.
// Extend or override in specific modules as needed.

import type { EventKeyType } from "@/events"

// BaseEventMap allows string or symbol keys for event names
export type BaseEventMap = Record<EventKeyType, unknown[]>

/** testing type */

export type TestEvents = BaseEventMap & {
  foo: [string]
  bar: [number]
}
