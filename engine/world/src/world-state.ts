import type { Entity } from "@stratamu/entity"
import type { EntityId } from "@stratamu/primitives"

/**
 * The authoritative entities in the world: what exists, what each thing's identity is, and where
 * it is. `occupants` answers "who is here" by querying that same location data, not by tracking a
 * separate relationship -- there is still only one fact (location), read two ways. It says
 * nothing about how entities otherwise relate to each other -- containment beyond location,
 * ownership, anything else -- and nothing about what "where" means (a room, in the proofs that
 * use it, but `WorldState` does not know that): those are `Entity` attributes an adapter adds, not
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

  /**
   * Removes an entity. Returns whether it was present. An entity cannot be removed while another
   * entity is located there, because that would leave a dangling location reference. Removing an
   * entity also clears its own location, so ordinary entities can be removed without requiring a
   * separate `locate` cleanup step. Whether a game operation is allowed to remove a populated
   * location is the caller's concern; this check only preserves `WorldState`'s data integrity.
   */
  remove(id: EntityId): boolean {
    if (!this.#entities.has(id)) {
      return false
    }

    for (const [entityId, locationId] of this.#locations) {
      if (entityId !== id && locationId === id) {
        throw new Error(`Cannot remove entity "${id}": entity "${entityId}" is located there`)
      }
    }

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

  /**
   * The id of every entity whose location is `id`, in no meaningful order -- including whatever
   * entity called this if it is itself at `id`: a neutral query over what `WorldState` already
   * knows, the same as `entities()`, not biased toward any one caller's need to exclude itself.
   * Ids, not `Entity` records, to match `locationOf`/`locate`'s own model and stay a fact, not a
   * lookup: a filter such as "exclude this one" or "visible to that one" belongs to whatever game
   * operation is asking, not to `WorldState`, so this takes no options and never will. Computed on
   * demand from `#locations`, not a maintained index: nothing here has shown a need for one yet.
   */
  *occupants(id: EntityId): IterableIterator<EntityId> {
    for (const [entityId, locationId] of this.#locations) {
      if (locationId === id) {
        yield entityId
      }
    }
  }
}
