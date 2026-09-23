import type { Entity } from "@stratamu/entity"
import type { EntityId } from "@stratamu/primitives"

/**
 * The authoritative entities in the world: what exists, what each thing's identity is, and where
 * it is. It says nothing about how entities otherwise relate to each other -- containment beyond
 * location, ownership, anything else -- and nothing about what "where" means (a room, in this
 * proof, but `WorldState` does not know that): those are `Entity` attributes an adapter adds, not
 * something this minimum model assumes.
 *
 * This is deliberately small: `WorldState` is the container a `Runtime` executes against, not a
 * redesign of every attribute a traditional MUD entity carries. What it needs beyond identity,
 * membership and location is discovered from what an adapter actually requires, not designed in
 * up front. Location was the first thing an actual feature -- movement -- revealed was needed.
 */
export class WorldState {
  readonly #entities = new Map<EntityId, Entity>()
  readonly #locations = new Map<EntityId, EntityId>()

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
    this.#locations.delete(id)
    return this.#entities.delete(id)
  }

  /** Every entity, in no meaningful order. */
  entities(): IterableIterator<Entity> {
    return this.#entities.values()
  }

  /**
   * Where an entity currently is, or undefined if it has none recorded. Says nothing about what
   * "where" means beyond another entity's id: whether that entity is a room, a container or
   * anything else is an adapter concept, not this one. Not every entity needs a location for this
   * to be meaningful -- a location that is itself unlocated is exactly what makes it a room.
   */
  locationOf(id: EntityId): EntityId | undefined {
    return this.#locations.get(id)
  }

  /**
   * Records where an entity currently is. Throws unless both `id` and `at` are entities that
   * already exist: a data-integrity check, the same kind `add` already makes for duplicate ids,
   * not a game rule -- whether a move is actually *allowed* (an exit exists, the entity can act,
   * anything else) is entirely the caller's concern, checked before this is ever called.
   */
  locate(id: EntityId, at: EntityId): void {
    if (!this.#entities.has(id)) {
      throw new Error(`Entity "${id}" does not exist`)
    }
    if (!this.#entities.has(at)) {
      throw new Error(`Entity "${at}" does not exist`)
    }
    this.#locations.set(id, at)
  }
}
