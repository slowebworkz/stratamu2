import type Emittery from "emittery"
import type {
  DebugLogger,
  DebugOptions,
  EmitteryOncePromise,
  EventName as EmitteryEventName,
  ListenerChangedData,
  Options as EmitteryOptions,
  UnsubscribeFunction,
} from "emittery"

/**
 * Re-export Emittery's native types for external use.
 * All Emittery type imports should go through this file.
 */
export type {
  DebugLogger as EmitteryDebugLogger,
  DebugOptions as EmitteryDebugOptions,
  EmitteryEventName,
  EmitteryOncePromise,
  EmitteryOptions,
  ListenerChangedData,
  UnsubscribeFunction as EmitteryUnsubscribeFunction,
}

// Helper to re-use the Emittery.on signature
export type EmitteryOnMethod<EventMap> = Emittery<EventMap>["on"]

// Parameters tuple for the Emittery.on method
export type EmitteryOnParams<EventMap> = Parameters<EmitteryOnMethod<EventMap>>

// Listener function type extracted from Emittery.on parameters
export type EmitteryOnListener<EventMap> = EmitteryOnParams<EventMap>[1]

// Emittery-compatible listener for a specific event key
export type EmitteryListenerFor<EventMap, K extends keyof EventMap> = (
  eventData: EventMap[K],
) => Promise<void> | void
