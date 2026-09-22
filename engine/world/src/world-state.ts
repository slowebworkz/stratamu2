import type { EntityId } from "@stratamu/primitives"

import type { Entity } from "@stratamu/entity"

/**
 * The authoritative entities in the world: what exists, and what each thing's identity is. It
 * says nothing about where entities are or how they relate to each other. Those are `Entity`
 * attributes an adapter adds, not something this minimum model assumes.
 *
 * This is deliberately small: `WorldState` is the container a `Runtime` executes against, not a
 * redesign of every attribute a traditional MUD entity carries. What it needs beyond identity and
 * membership is discovered from what an adapter actually requires, not designed in up front.
 */
export class WorldState {
  readonly #entities = new Map<EntityId, Entity>()

  /** How many entities exist. */
  get size(): number {
    return this.#entities.size
  }

  /** Adds an entity. Throws if its id is already present. */
  add(entity: Entity): void {
    if (this.#entities.has(entity.id)) {
      throw new Error(`Entity "${entity.id}" already exists`)
    }
    this.#entities.set(entity.id, entity)
  }

  /** The entity with this id, or undefined if none exists. */
  get(id: EntityId): Entity | undefined {
    return this.#entities.get(id)
  }

  /** Whether an entity with this id exists. */
  has(id: EntityId): boolean {
    return this.#entities.has(id)
  }

  /** Removes an entity. Returns whether it was present. */
  remove(id: EntityId): boolean {
    return this.#entities.delete(id)
  }

  /** Every entity, in no meaningful order. */
  entities(): IterableIterator<Entity> {
    return this.#entities.values()
  }
}
