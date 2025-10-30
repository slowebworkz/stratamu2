// Generic event name type (single or array)
export type EventName<EventMap extends Record<string, unknown>> =
  | keyof EventMap
  | readonly (keyof EventMap)[]
