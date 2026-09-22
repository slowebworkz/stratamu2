# @stratamu/engine-world

The engine's **authoritative game state**: what the `Runtime` executes against, as distinct from `Runtime`'s own bookkeeping (tasks, clocks, timelines, queues), which has no opinion about game state at all. See the architecture document's `Engine` sketch (`Runtime`, `WorldState`, `Sessions`, `Authority`, `Adapter`).

**Status:** prototype, deliberately minimal. Private and unpublished.

## What exists

- `WorldState`: the authoritative entities in the world — what exists, and each thing's identity. `add`, `get`, `has`, `remove`, `entities()`, `size`. It says nothing about where entities are or how they relate to each other; those are `Entity` attributes an adapter adds, discovered from what a game actually needs.
- `EngineState`: `{ readonly world: WorldState }`. What the engine executes against. Deliberately just `world` for now — `Sessions` and `Authority`, named alongside `WorldState` in the architecture document's `Engine` sketch, are not here because neither exists yet. This grows by adding fields as those are built, not by reserving space for them now.

`Entity` and `EntityType` live in [`@stratamu/entity`](../../libs/entity), not here: this package owns the authoritative *container*, not the shape of what it contains.

## Not yet

- Anything beyond identity and membership: locations, relationships, attributes. Not designed wholesale — discovered from what an adapter actually needs. The old giant `BaseEntity` (id, type, name, description, location, owner, flags, attributes, timestamps...) is exactly what this is avoiding.
- `Sessions` and `Authority` on `EngineState`. Sessions is the next branch in the roadmap; Authority ("who may change what") has no design yet.
- Wiring into `Runtime`/`TaskContext`, so a handler can actually read or write a `WorldState`. That interface is deliberately not guessed at here — it should emerge from a real vertical slice (a `look` command, say), not be designed before anything needs it.
- Persistence. `WorldState` is in-memory only.

## Depends on

`@stratamu/entity`, `@stratamu/primitives`.
