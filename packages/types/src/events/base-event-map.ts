// Canonical event map type for event emitters in the base package.
// Extend or override in specific modules as needed.

export type BaseEventMap<T = unknown> = {
  [key: string]: T
}

/** testing type */

export type TestEvents = BaseEventMap & {
  foo: [string]
  bar: [number]
}
