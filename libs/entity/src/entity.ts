import type { EntityId } from "@stratamu/primitives"

import type { EntityType } from "./entity-type.ts"
import { entityType } from "./entity-type.ts"

/**
 * The minimum a thing in the world needs to be addressable: an identity and a type. It says
 * nothing about name, description, location or any other attribute: those are an adapter's
 * concern, discovered from what a game actually needs rather than designed in up front.
 *
 * Adapters define their own unions, which narrow on `type`:
 *
 *     type MushEntity = Entity<"mush.object"> | Entity<"mush.room">
 */
export interface Entity<T extends EntityType = EntityType> {
  readonly id: EntityId
  readonly type: T
}

/**
 * Creates an Entity, checking its type at run time. The result is frozen.
 */
export function entity<const T extends EntityType>(id: EntityId, type: T): Entity<T> {
  return Object.freeze({
    id,
    type: entityType(type),
  })
}
