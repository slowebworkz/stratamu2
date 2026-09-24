import type { EntityId } from "@stratamu/primitives"

/**
 * AberMUD's own object vocabulary. The historical `ob.in` format also carries flags such as
 * open/closed, locked/unlocked, lit/extinguished, worn, weapon, container, food and key -- none
 * modeled here. Containment and equipment (`get`/`drop`/`wear`/`put`) are a deliberate
 * architectural probe left for a later slice, not assumed in this definition ahead of that
 * evidence.
 */
export interface AberObjectDefinition {
  readonly id: EntityId
  readonly name: string
  readonly description: string
}
