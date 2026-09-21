# StrataMU2

A general-purpose multiplayer world engine for persistent, text-based worlds.

StrataMU2 is a Node.js/TypeScript project exploring a modern, modular architecture for building systems in the tradition of **MUDs, MUSHes, MOOs, MUCKs, MUXes, and related multi-user worlds**.

The goal is not to build a single predefined type of game. The goal is to provide a reusable runtime for persistent, stateful, multi-user worlds with pluggable rules, domain systems, storage, networking, and presentation.

> **Status: Early development**
>
> The repository currently contains the project foundation, architecture, workspace configuration, and development tooling. The game engine itself is under active development.

## Project Goals

StrataMU2 is being designed around several core principles:

- **Authoritative world state** — the engine owns and coordinates the live world.
- **State transitions** — world changes occur through controlled actions and transitions rather than arbitrary mutation.
- **Game profiles** — MUD, MUSH, MOO, and other styles are represented through adapters rather than separate engines.
- **Domain capabilities** — gameplay capabilities such as combat, magic, scripting, economy, and NPC behavior are optional and independent of the core. Where each one lives is not yet decided.
- **Execution semantics by profile** — different traditions order and time work differently, so the core provides an execution substrate and each adapter selects the execution policy.
- **Infrastructure independence** — storage, networking, and presentation are replaceable implementation boundaries.
- **Transport independence** — the engine is not coupled to Telnet or any particular client protocol.
- **Controlled concurrency** — multiple players and asynchronous activities can interact with the world without compromising authoritative state.
- **Explicit lifecycle management** — the engine owns startup, runtime operation, and shutdown.

At a high level:

```text
                  ┌─────────────────────┐
                  │     GAME ENGINE     │
                  │                     │
 input / event ──►│ rules → authority  │
                  │        → transition│
                  │        → consequences
                  └──────────┬──────────┘
                             │
                    authoritative
                      world state
                             │
              ┌──────────────┼──────────────┐
              │              │              │
          persistence     sessions       systems
              │              │              │
          YAML / SQL     Telnet / ...   combat / ...
```

## Architecture

The engine is intentionally divided into several kinds of components.

### Engine

The engine provides the runtime that coordinates:

- World state
- Actions and state transitions
- Rules and authority
- Events and scheduling
- Sessions and player I/O
- Persistence
- Startup and shutdown
- Runtime coordination

The engine should remain independent of any particular game genre or transport.

### Adapters

Adapters define a **game profile**.

A profile can determine which capabilities are enabled and how those capabilities behave for a particular style of world.

Examples may eventually include:

```text
MUD
MUSH
MOO
MUCK
MUX
Custom
```

An adapter is not intended to be a second game engine. It configures and extends the common runtime. That includes its execution semantics: an adapter selects the execution policy that decides how ready work is ordered, timed and budgeted.

### Plugins

Plugins provide replaceable infrastructure and integrations at boundaries the engine defines.

Potential plugin areas include:

```text
Storage
Networking
Protocols
Presentation
Logging and event infrastructure
```

Gameplay domains such as combat, scripting, economy, and population are architectural capabilities. They are not assumed to be plugins.

Not every game needs every plugin.

### Libraries

`libs/` contains private reusable support code used across the monorepo, such as:

- TypeScript configurations
- ESLint configurations
- Biome configuration
- Basic definitions such as clocks (`@stratamu/clock`), which the engine receives as instances

### Applications

`apps/` contains executable compositions of the engine.

For example, a future server application can select:

```text
engine
  + adapter
  + plugins
  + configuration
```

and then start the engine.

The application composition layer should not become responsible for the internal lifecycle of the running game.

## Workspace Structure

The repository is organized as a pnpm/Turborepo monorepo:

```text
.
├── adapters/       # Game profiles and adapter implementations
├── apps/           # Executable applications
├── docs/           # Project and architecture documentation
├── engine/         # Core engine: the execution substrate and world runtime
├── libs/           # Private reusable support code and shared configuration
├── packages/       # Transitional: predates the layout above, to be relocated
└── plugins/        # Replaceable infrastructure and integrations
```

The exact contents of these workspaces will evolve as implementation begins. Every workspace has a `README.md` that says what it is for and what state it is in. `packages/` is a transition state, described in the architecture document.

## Engine Lifecycle

The engine owns the lifecycle of the running world.

Conceptually:

```text
NOT RUNNING
     │
     ▼
INITIALIZING
     │
     ▼
  RUNNING
     │
     ▼
 STOPPING
     │
     ▼
  STOPPED
```

Startup is responsible for establishing the runtime, loading the selected profile and plugins, loading persistent world state, and beginning normal world activity.

Shutdown is responsible for stopping new activity, completing or cancelling active work, flushing sessions, persisting authoritative state, and shutting down infrastructure.

The exact implementation will evolve as the runtime is built.

## Development

### Requirements

- Node.js `>= 22.19.0`
- pnpm `12.x`

The repository uses TypeScript, pnpm workspaces, and Turborepo.

### Install

```sh
pnpm install
```

### Build

Build all workspaces:

```sh
pnpm build
```

### Development

Run development tasks across the repository:

```sh
pnpm dev
```

### Type Checking

```sh
pnpm typecheck
```

### Linting

```sh
pnpm lint
```

Apply automatic lint fixes where supported:

```sh
pnpm lint:fix
```

### Tests

```sh
pnpm test
```

### Clean

```sh
pnpm clean
```

## Documentation

The primary architecture document is:

**[Game Engine Architecture](./docs/GAME_ENGINE_ARCHITECTURE.md)**

It describes the current working design in greater detail, including:

- Engine responsibilities
- World state
- Player/session I/O
- Rules and authority
- State transitions
- Lifecycle management
- Persistence
- Concurrency
- Execution substrate, execution policy and the work model
- Determinism
- Adapters
- Plugins
- Domain systems
- Monorepo organization

The architecture is intentionally a **working design** and will change as implementation validates or challenges the current model.

## Development Philosophy

StrataMU2 is being developed from the runtime outward.

Rather than implementing an entire MUD first and attempting to generalize it later, the project is intended to establish a small, coherent engine core and then prove that different world models can be built on top of it.

A useful architectural test will be whether substantially different systems can share the same core runtime:

```text
              ┌─────────────────┐
              │   Core Engine   │
              └────────┬────────┘
                       │
             ┌─────────┴─────────┐
             │                   │
        ┌────▼────┐         ┌────▼────┐
        │   MUD   │         │  MUSH   │
        │ profile │         │ profile │
        └─────────┘         └─────────┘
```

If a particular world model requires duplicating the engine, the abstraction is probably in the wrong place.

The project therefore favors:

- Small, explicit interfaces
- Clear ownership of mutable state
- Composition over inheritance
- Replaceable infrastructure
- Minimal assumptions in the core
- Incremental implementation backed by executable tests

## Branching Model

The repository uses a Gitflow-style development model:

```text
main
  ▲
  │ release PRs
  │
develop
  ▲
  │ feature work
  │
feature/*
```

`develop` is the primary integration branch for ongoing work.

`main` represents released/stable history and receives changes from `develop` through pull requests.

## Project Status

Current work is focused on establishing the repository and architecture foundation.

### Current

- [x] Monorepo structure
- [x] pnpm workspace
- [x] Turborepo pipeline
- [x] Shared TypeScript configuration
- [x] Shared linting configuration
- [x] Shared Biome configuration
- [x] Initial engine architecture
- [x] Engine lifecycle direction
- [x] Execution substrate prototype (tasks, named clocks, execution-policy seam)
- [ ] Execution work model: waiting and waking, recurring work, phases, budgets
- [ ] Core engine implementation
- [ ] Authoritative world state
- [ ] State-transition system
- [ ] Persistence implementation
- [ ] Session system
- [ ] Networking implementation
- [ ] First game adapter
- [ ] First domain plugin
- [ ] Complete playable vertical slice

The checklist is intentionally conservative. Architectural decisions will be validated through implementation rather than treated as final simply because they are documented.

## License

License information will be added when the project's distribution model is finalized.
