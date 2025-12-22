import type { EventKey } from "../events/index.ts"

/** Emitter Event key type supporting string unions */
export type EmitterEventKey<EventMap> = EventKey<EventMap>
