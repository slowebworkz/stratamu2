import type { EmitteryUnsubscribeFunction } from "./index.ts"

/**
 * Function returned when subscribing to an event.
 * Call it to unsubscribe from the event.
 */
export type UnsubscribeFunction = EmitteryUnsubscribeFunction
