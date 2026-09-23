# @stratamu/adapter-test

A deliberately tiny **game adapter**: not a real game, but the smallest thing that exercises the
adapter contract five earlier engine-core probes (session boundary, player control, world
movement, world messaging, session lifecycle) each proved a piece of, without ever building one.
See section 9 of [the architecture](../../docs/GAME_ENGINE_ARCHITECTURE.md), and the "Conceptual
Composition" sketch there: `ENGINE CORE` answers "how do I execute this `Work`"; this package
answers "what kind of game is this, and how does input become `Work`".

**Status:** prototype, deliberately minimal. Private and unpublished.

## What exists

- `TestAdapter`: the smallest contract that composes the already-proven pieces. Not a
  `GameAdapter` god interface (`parseInput`/`registerCommands`/`createWorld`/`authorize`/`...`) --
  exactly two capabilities:
  - `parse(input: SessionInput): readonly Work[]` -- raw session input to zero, one, or more
    `Work`. An empty array for input this grammar doesn't recognize, the same "no Work, so no
    output" the session-boundary probe proved. Resolves the session's controlled actor once, from
    `control`.
  - `registerHandlers(runtime: Runtime): void` -- supplies this adapter's handlers to a `Runtime`
    using the registration `Runtime` already has (`handle(kind, handler)`). No new engine concept
    was needed for this: the same finding every probe already made about `TaskContext`.
  plus the adapter-owned data those two capabilities needed: `control` (`Control`, `PrincipalId ->
  EntityId` -- who owns what) and `exits` (`Exits`, `EntityId -> (direction -> EntityId)` -- which
  way leads where). Neither is `EngineState`: `world` and `sessions` are still supplied
  externally, by whoever composes a `Runtime` -- see `test-adapter.test.ts`'s `setup()`.
- `test.look` / `test.move` / `test.say`: this adapter's own `WorkKind` namespace, the real owner
  the architecture document's work model always intended for strings like these. `engine/core`
  still treats every `WorkKind` as opaque and never imports this package.
- `SessionInput`: `{ session: Session; raw: string }` -- what a real transport loop would have in
  hand for one line of session-originated input.
- `testSession`: the same in-process fake `Session` five probes each declared locally, promoted
  here once enough of them needed the identical thing -- the same reasoning that promoted `Session`
  itself into `@stratamu/engine-sessions`.

## Grammar

Deliberately the smallest thing that exercises three already-proven operations, not a real MU*
command language: `look` (reflexive -- describes the actor's own controlled entity), `say <line>`,
`move <direction>`. Anything else parses to no `Work` at all.

## What this settles about adapter-owned state

`WorldState` knows `Entity -> Location` (a generic authoritative fact). Only this adapter knows
`location + direction -> destination` (`exits`) and `PrincipalId -> EntityId` (`control`, "who
owns what" -- kept separate from `@stratamu/engine-sessions`'s `Sessions`, "who is reachable right
now", for exactly the reason that package's own README preserves). Neither belongs in
`@stratamu/engine-world` or `@stratamu/engine-sessions`: both are game rules, decided entirely by
this adapter, the same way the world-movement probe found the movement rule itself belongs in a
handler, never in `WorldState.locate`.

This is one example, not a universal rule. What else belongs to an adapter versus `WorldState`
stays something the *next* real adapter's actual needs decide, not something designed in here
ahead of that need.

## Not yet

- A real command grammar, verbs beyond `look`/`move`/`say`, or more than one `Work` from a single
  line of input. Nothing has needed it yet.
- Game configuration, world construction/serialization, or anything about engine composition
  (wiring an adapter, a `Runtime`, a `WorldState` and a `Sessions` together into one running
  engine). That is the next branch's concern, not this one's.
- A second adapter. This one exists to exercise the contract, not to be the last one.

## Depends on

`@stratamu/engine-core` (`Runtime`, and `TaskContext.world`/`.sessions`'s types, flowed through
without this package ever importing `WorldState`/`Sessions` by name), `@stratamu/engine-sessions`
(`Session`), `@stratamu/primitives`, `@stratamu/work`. `@stratamu/engine-world` and
`@stratamu/entity` are dev-only, used by this package's own tests to build a `WorldState` to run
against -- production code here never constructs one.
