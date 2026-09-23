# @stratamu/engine-world

The engine's **authoritative game state**: what the `Runtime` executes against, as distinct from `Runtime`'s own bookkeeping (tasks, clocks, timelines, queues), which has no opinion about game state at all. See the architecture document's `Engine` sketch (`Runtime`, `WorldState`, `Sessions`, `Authority`, `Adapter`).

**Status:** prototype, deliberately minimal. Private and unpublished.

## What exists

- `WorldState`: the authoritative entities in the world — what exists, and each thing's identity. `add`, `get`, `has`, `remove`, `entities()`, `size`. It says nothing about where entities are or how they relate to each other; those are `Entity` attributes an adapter adds, discovered from what a game actually needs.
- `EngineState`: `{ readonly world: WorldState }`. What the engine executes against. Deliberately just `world` for now — `Sessions` and `Authority`, named alongside `WorldState` in the architecture document's `Engine` sketch, are not here because neither exists yet. This grows by adding fields as those are built, not by reserving space for them now.

`Entity` and `EntityType` live in [`@stratamu/entity`](../../libs/entity), not here: this package owns the authoritative *container*, not the shape of what it contains.

## How a handler reaches it

`Runtime` accepts an `EngineState` at construction (`RuntimeOptions.engineState`, optional — a `Runtime` has no opinion about game state, so it works without one) and threads its `world` through to `TaskContext.world`, unread and uninterpreted, for both a scheduler-run task and an inline one. See `@stratamu/engine-core`'s "vertical slice" test for the whole path proven end to end: `Input -> Work -> Task -> Runtime -> TaskHandler -> EngineState -> WorldState -> Output`.

`WorldState` is not the authority system. `world.add(entity)`/`world.remove(id)` are plain data operations today, with no rule-checking — a handler that calls them directly is not (yet) going through anything that could refuse. That is fine for now: this is an internal authoritative data structure, not a public game API. Whatever eventually decides *whether* a mutation is allowed (`Authority`, in the architecture document's `Engine` sketch) sits between a handler and `WorldState`, not inside it — that boundary has no design yet, and isn't being retrofitted in speculatively.

## Not yet

- Anything beyond identity and membership: locations, relationships, attributes. Not designed wholesale — discovered from what an adapter actually needs. The old giant `BaseEntity` (id, type, name, description, location, owner, flags, attributes, timestamps...) is exactly what this is avoiding.
- `Sessions` and `Authority` on `EngineState`. `Sessions` has a design investigation, not yet an implementation — see [SESSION_BOUNDARY.md](../../docs/SESSION_BOUNDARY.md). `Authority` has no design yet: nothing stops a handler from calling `world.remove(...)` directly, bypassing whatever rules a game would want to apply first.
- Persistence. `WorldState` is in-memory only.

## Depends on

`@stratamu/entity`, `@stratamu/primitives`.
