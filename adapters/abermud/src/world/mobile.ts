import type { EntityId } from "@stratamu/primitives"

/**
 * AberMUD's own mobile (non-player character) vocabulary. Deliberately minimal: the historical
 * AberMUD mobile also carries combat stats, aggression, and reset/respawn behavior. None of that
 * is modeled yet -- this adapter has no slice that has asked for it. See the package README's
 * "Not yet".
 */
export interface AberMobileDefinition {
  readonly id: EntityId
  readonly name: string
  readonly description: string
}
