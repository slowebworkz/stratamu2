# StrataMU2

A general-purpose multiplayer world engine for persistent, text-based worlds.

StrataMU2 is a Node.js/TypeScript project exploring a modern, modular architecture for building systems in the tradition of **MUDs, MUSHes, MOOs, MUCKs, MUXes, and related multi-user worlds**.

The goal is not to build a single predefined type of game. The goal is to provide a reusable runtime for persistent, stateful, multi-user worlds with pluggable rules, domain systems, storage, networking, and presentation.

> **Status: Early development**
>
> The engine substrate (`Runtime`, `WorldState`, `Sessions`), a Telnet transport plugin, and a first real game adapter (AberMUD II) are implemented and tested. `apps/server` composes them into a playable vertical slice: start it and connect with `telnet`. It does not yet run its own continuous runtime loop, shut down gracefully, or have a dedicated development workflow — see [Development Server](./docs/DEVELOPMENT_SERVER.md) for that plan, and "Workspace Structure" and "Project Status" below for what exists package by package.

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

The first real one, `@stratamu/adapter-abermud`, is a MUD profile: an independent reimplementation of AberMUD II's actual command behavior (not a port of its C source) on top of the generic engine, verified command by command against the recovered original. Other traditions remain future work:

```text
MUD    <- @stratamu/adapter-abermud (AberMUD II)
MUSH
MOO
MUCK
MUX
Custom
```

An adapter is not intended to be a second game engine. It configures and extends the common runtime. That includes its execution semantics: an adapter selects the execution policy that decides how ready work is ordered, timed and budgeted.

### Plugins

Plugins provide replaceable infrastructure and integrations at boundaries the engine defines.

The first one, `@stratamu/plugin-telnet`, covers networking: a `Connection` (lines in, text out) and Telnet negotiation over a real socket, with no adapter or engine code aware a socket is involved. Other plugin areas remain future work:

```text
Storage
Networking    <- @stratamu/plugin-telnet (Telnet)
Protocols
Presentation
Logging and event infrastructure    <- @stratamu/capabilities (contracts + default adapters)
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

`apps/server` selects:

```text
engine
  + adapter
  + plugins
  + configuration
```

and then starts the engine.

The application composition layer should not become responsible for the internal lifecycle of the running game.

## Workspace Structure

The repository is organized as a pnpm/Turborepo monorepo. Every workspace below is a real,
published-internally (`private: true`) package with its own `README.md`, tests, and Turbo
`build`/`lint`/`typecheck`/`test` tasks:

```text
.
├── adapters/                # Game profiles and adapter implementations
│   ├── abermud/              # @stratamu/adapter-abermud — AberMUD II reimplemented on the engine
│   └── test/                 # @stratamu/adapter-test — the smallest adapter that exercises it
├── apps/                    # Executable applications
│   └── server/                # @stratamu/server — composes the engine, AberMUD adapter, and Telnet plugin into a playable server
├── docs/                    # Project and architecture documentation
├── engine/                  # Core engine: the execution substrate and world runtime
│   ├── core/                 # @stratamu/engine-core — tasks, clocks, timelines, the Runtime
│   ├── sessions/              # @stratamu/engine-sessions — which connections are active
│   └── world/                 # @stratamu/engine-world — WorldState, the authoritative game state
├── libs/                    # Private reusable support code and shared configuration
│   ├── base/                  # @stratamu/base — a lazily-created, contextual logger
│   ├── biome-config/          # @stratamu/biome — shared Biome (format/lint/import sort) config
│   ├── capabilities/          # @stratamu/capabilities — logging/events capability contracts
│   ├── clock/                 # @stratamu/clock — clock instances the engine receives
│   ├── entity/                # @stratamu/entity — Entity: an identity and a type
│   ├── eslint-config/         # @stratamu/eslint — shared ESLint 10 flat config
│   ├── primitives/            # @stratamu/primitives — shared value types (EntityId, and so on)
│   ├── submission/            # @stratamu/submission — a request to execute a Work
│   ├── task/                  # @stratamu/task — the immutable, admitted execution instance
│   ├── typescript-config/     # @stratamu/typescript-config — shared tsconfig presets
│   └── work/                  # @stratamu/work — what operation is requested, and its input
└── plugins/                 # Replaceable infrastructure and integrations
    └── telnet/                # @stratamu/plugin-telnet — Telnet Connection/Session transport
```

A directory becomes a workspace only when its responsibility is established, the same discipline
the architecture document describes. Nothing above is speculative -- each package's own `README.md`
documents what it actually does and cites its own tests; this table is a map, not a promise.

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

### Dev Tasks

Run development tasks across the repository:

```sh
pnpm dev
```

### Development Server

`apps/server` is the playable vertical slice. The current, manual development command — it builds
and runs the server in the foreground, with no managed restart or watch behavior yet — is:

```sh
pnpm --filter @stratamu/server dev
```

Connect with a Telnet client:

```sh
telnet localhost 4000
```

A dedicated `dev:server`/`dev:server:kill`/`dev:server:restart` workflow, isolated dev
configuration/data, and VS Code tasks are planned — see
[Development Server](./docs/DEVELOPMENT_SERVER.md).

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

The development workflow for running `apps/server` locally — the runtime loop, graceful shutdown,
start/stop/restart commands, and isolated dev config/data — is tracked separately in
**[Development Server](./docs/DEVELOPMENT_SERVER.md)**.

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

Current work is proving the engine core against a real, specific game (AberMUD II) one command
slice at a time, rather than building out a generic core in the abstract.

### Current

- [x] Monorepo structure
- [x] pnpm workspace
- [x] Turborepo pipeline
- [x] Shared TypeScript configuration
- [x] Shared linting configuration
- [x] Shared Biome configuration
- [x] Initial engine architecture
- [x] Engine lifecycle direction
- [x] Execution substrate (`@stratamu/engine-core`: `Runtime`, `Task`, `Work`, named clocks, an
      execution-policy seam)
- [x] Core engine implementation (`Runtime.handle`/`submit`/`drain`/`pump`, in active use by a
      real adapter)
- [x] Authoritative world state (`@stratamu/engine-world`'s `WorldState`: entities, locations,
      containment)
- [x] Session system (`@stratamu/engine-sessions`'s `Sessions`: open/`activeFor`/disconnect)
- [x] Networking implementation (`@stratamu/plugin-telnet`: a `Connection` over a real socket,
      Telnet negotiation)
- [x] First game adapter (`@stratamu/adapter-abermud`: LOOK/MOVE/SAY/TELL/WHO/SAVE/GET/DROP/
      INVENTORY/QUIT/WIELD/WEAR/REMOVE/KILL, each verified against the recovered AberMUD II source)
- [ ] Execution work model: waiting and waking, recurring work, phases, budgets -- still an open
      question combat's own next slice (repeated rounds, per-actor locking) is expected to force
- [ ] A generic state-transition/`Authority` abstraction (`WorldState` mutations happen directly
      today; nothing generic sits between a command and them yet)
- [ ] Engine-level persistence (the adapter has its own real `uaf.rand`-compatible persistence;
      nothing at the core/engine level is generic yet)
- [ ] First domain plugin (equipment/combat live inside the adapter so far, not factored out as an
      independent, adapter-agnostic plugin)
- [x] Complete playable vertical slice (`apps/server` composes the adapter, the Telnet plugin, and
      persistence into something a client can connect to and play; a manual end-to-end walkthrough
      over a real Telnet connection is still pending)
- [ ] Server-owned continuous runtime driver (the engine currently only advances in response to
      client input; see [Development Server](./docs/DEVELOPMENT_SERVER.md))
- [ ] Graceful server shutdown (state persistence, session draining, resource/log flushing on
      `SIGINT`/`SIGTERM`; see [Development Server](./docs/DEVELOPMENT_SERVER.md))
- [ ] Development-server workflow (start/stop/restart commands, watch mode, isolated dev
      config/data, VS Code tasks; see [Development Server](./docs/DEVELOPMENT_SERVER.md))

The checklist is intentionally conservative. Architectural decisions will be validated through implementation rather than treated as final simply because they are documented.

## License

License information will be added when the project's distribution model is finalized.
