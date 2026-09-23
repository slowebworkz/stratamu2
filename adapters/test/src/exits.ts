import type { EntityId } from "@stratamu/primitives"

/**
 * Which direction leads where, from a given room: the same shape the world-movement probe
 * settled on. Adapter data -- `WorldState` never sees it, only the `locate` call `move`'s handler
 * makes once it has consulted this. The concrete example the architecture document's "adapter-
 * owned state" question pointed to: `WorldState` knows `Entity -> Location`; only the adapter
 * knows `location + direction -> destination`.
 */
export type Exits = Map<EntityId, Map<string, EntityId>>
