// Canonical event map type for event emitters in the base package.
// Extend or override in specific modules as needed.

// BaseEventMap allows string or symbol keys for event names
export type BaseEventMap<T = unknown[]> = Record<string | symbol, T>

/** testing type */

export type TestEvents = BaseEventMap & {
  foo: [string]
  bar: [number]
}
