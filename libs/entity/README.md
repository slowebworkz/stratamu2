# @stratamu/entity

`Entity`: the minimum a thing in the world needs to be addressable — an identity and a type.

**Status:** small and tested. Private and unpublished. Depends on [`@stratamu/primitives`](../primitives) for `EntityId` and the namespaced-kind guard. Used by `@stratamu/engine-world`.

## What exists

- `Entity<T>`: `{ readonly id: EntityId; readonly type: T }`. It says nothing about name, description, location, owner or any other attribute. Those are an adapter's concern, discovered from what a game actually needs rather than designed in up front — see [the architecture document](../../docs/GAME_ENGINE_ARCHITECTURE.md) on not recreating the old giant `BaseEntity`.
- `entity(id, type)`: creates an `Entity`, checking its type at run time. The result is frozen.
- `EntityType`: a dotted name owned by whoever defines it, such as `mush.object`, `moo.room` or `diku.mobile`. `isEntityType` is the guard, for data that has not been checked, such as a type read back from storage. `entityType` checks a type at run time and returns it with its literal type intact, so a malformed one fails when the module that declares it loads.

## Rules

- **Adapters own the types.** This package defines no types and knows nothing about MUSH, MOO, Diku or any other game. An adapter defines its own union:
  ```ts
  type MushEntity = Entity<"mush.object"> | Entity<"mush.room">
  ```
- **Types are namespaced,** so a MUSH `room` and a MOO `room` cannot collide.
- **`EntityType` is a template-literal type, not a brand:** `` `${string}.${string}` ``. A literal type keeps its exact type, so a union of `Entity` values narrows on `type`. A brand would erase the literal and break that. The type checks at compile time that a type has a namespace, and it cannot check the rest of the pattern, such as lower case, so the guard and `entity()` check that at run time.
- **`Entity` is structural,** so a plain `{ id, type }` object is assignable to it without going through `entity()`. Anything that accepts `Entity` from outside should check the type with `isEntityType` itself.
- **The pattern lives in `@stratamu/primitives`,** as `isNamespacedKind`, the same guard `@stratamu/work`'s `WorkKind` uses. `Entity` and `Work` are deliberately parallel: same reasoning, same shape of solution, for two different concepts.

## Not yet

- An `isEntity` guard for a whole stored `Entity`.
- Everything a real game needs beyond identity and type: name, description, location, owner, attributes. None of it is added speculatively. `@stratamu/engine-world`'s `WorldState` is where an entity actually lives; what it needs beyond this minimum is discovered from there, not designed wholesale here.
