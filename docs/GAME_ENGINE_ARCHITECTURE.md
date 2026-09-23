# Game Engine Architecture — Working Design Notes

Status: Work in progress  
Branch model: Gitflow-style (`develop` for integration, `main` for released/stable history)

## 1. Project Direction

The project is a general-purpose multiplayer world/game engine suitable for traditional text-world systems such as MUDs, MUSHes, MOOs, MUCKs, MUXes, and related systems.

The implementation currently exists as a Node/TypeScript project, but the architecture should not be conceptually constrained by Node.

The intended result is not merely a "MUD engine." It is a persistent, stateful, multi-user world runtime with pluggable rules, domain systems, persistence, networking, and presentation.

## 2. Core Principle

The core engine maintains an authoritative live world and coordinates the flow of information into and out of that world.

At the highest level:

```text
                GAME ENGINE

       input / event / timer / system action
                         |
                         v
                   resolve rules
                         |
                         v
                  validate authority
                         |
                         v
                   state transition
                         |
                         v
                   emit consequences
                         |
                         v
                       output
```

The core should be responsible for keeping the world coherent, current, and available to multiple simultaneous participants.

## 3. Core Engine Responsibilities

### World I/O

Manage the flow of world information in and out of the running engine.

- Load world state through storage implementations.
- Maintain the authoritative in-memory/live representation.
- Persist state through storage implementations.
- Keep the engine independent of YAML, SQL, NoSQL, files, etc.

### Player I/O

Manage the flow of information between the game and participating players.

- Receive player input.
- Associate input with a player/session.
- Turn input into game actions.
- Produce semantic output.
- Deliver output to sessions/clients.

The engine should not be coupled to Telnet or any particular transport.

### Rules and Authority

Provide the mechanism through which game rules are evaluated.

- Determine whether an action is valid.
- Determine whether a participant is authorized.
- Apply rules to attempted state transitions.
- Allow adapters/game profiles to define the applicable rules.

The engine enforces rules at the appropriate transition point; adapters and domain systems define the rules.

### State and Time

Keep the live world from becoming stale or inconsistent.

- Apply state transitions.
- Coordinate events.
- Run scheduled/delayed/repeating activity.
- Coordinate world activity that occurs independently of direct player input.
- Maintain a coherent current state.

### Engine Lifecycle

The engine owns the lifecycle of the running game, including startup and shutdown.

The lifecycle moves through broad states:

```text
not running
    |
    v
initializing
    |
    v
running
    |
    v
stopping
    |
    v
stopped
```

Startup is coordinated by the engine. It should establish the correct ordering for initializing engine infrastructure, loading the selected adapter/game profile, initializing required plugins, loading persistent world state, constructing the authoritative live world, initializing runtime state/events/scheduling, establishing networking/session infrastructure where applicable, and starting normal game activity.

Conceptually:

```text
START
  |
  v
initialize engine
  |
  v
load configuration/profile
  |
  v
initialize plugins
  |
  v
load world
  |
  v
initialize runtime state
  |
  v
start scheduling/events
  |
  v
start accepting players
  |
  v
RUNNING
```

Shutdown is likewise coordinated by the engine because the engine owns authoritative live state.

A controlled shutdown should broadly provide for:

```text
RUNNING
   |
   v
STOP REQUEST
   |
   v
stop accepting new players
   |
   v
finish/cancel active work
   |
   v
disconnect/flush sessions
   |
   v
persist authoritative state
   |
   v
shutdown plugins/infrastructure
   |
   v
STOPPED
```

The exact ordering is an implementation detail to establish later, but lifecycle coordination is an engine responsibility.

`apps/server` should primarily be an application composition/root entry point: it constructs the engine, selects the adapter and plugins, and starts the engine. The engine itself owns the running game's lifecycle.

### Reliability / Concurrency

The engine must support many simultaneous players without allowing concurrent activity to corrupt or stall the authoritative world.

Important principles:

- Concurrent input is expected.
- Authoritative state transitions must be controlled.
- One player's slow connection must not block the world.
- Persistence must not unnecessarily block player activity.
- Output needs backpressure.
- Failures should be contained where possible.
- Shutdown/restart/recovery should be deliberate.
- The architecture should not require a multithreaded implementation.

The important requirement is concurrent-safe state management, not "multithreading."

## 4. What "World State" Means

World state is broader than static rooms and objects.

A world modification is any operation that changes authoritative game state in a way that can affect future behavior or what participants observe.

Examples include:

### Structural state

- Create/delete rooms.
- Create/delete objects.
- Create/remove/move exits.
- Change ownership.
- Change object properties.

### Dynamic game state

- Move a player.
- Spawn an NPC.
- Kill an NPC.
- Change health.
- Pick up/drop an item.
- Open/close something.
- Change currency.
- Change environmental state.

### Behavioral state

- Add/change a command or verb.
- Add/change a trigger.
- Add/change a script.
- Create an autonomous or semi-autonomous object.
- Change behavior through properties.

This is important for MUSH/MOO/MUCK-style games where players with appropriate authority can modify not only the physical world but its behavior.

## 5. Runtime State Domains

It is useful to distinguish:

### World state

- Entities
- Locations
- Relationships
- Properties
- Population
- Dynamic game state
- Behavioral state

### Session state

- Connections
- Authentication
- Client capabilities
- Input/output buffers
- Player association

### Engine state

- Tasks
- Timers
- Event queues
- Runtime bookkeeping

### Persistent state

The durable representation of the world outside the running engine.

The running engine owns the live world; persistence represents it externally.

## 6. Traditional Game Concepts the Core Can Understand

The core should not be reduced to a generic state machine.

It can provide the traditional machinery expected by these games while leaving rules/configuration to higher layers.

Potential traditional concepts include:

- players
- rooms/locations
- objects/things
- NPCs
- exits/links
- inventory/containment
- movement
- commands
- communication
- properties
- ownership
- permissions
- population/lifecycle
- combat
- social interaction
- building/creation
- events
- scheduling
- sessions

The important distinction is:

> The core provides the machinery; adapters and domain systems provide game-specific meaning, configuration, and restrictions.

For example, the core can provide movement, combat operations, spawning, creation, destruction, property mutation, and communication without deciding the exact rules for those operations.

## 7. State Transitions

The most important unifying abstraction is the state transition.

Different games produce very different actions:

```text
attack goblin
pose
@create object
move north
spawn wolf
set property
open door
cast spell
```

But all of them ultimately become:

```text
action/event
    |
    v
rules + authority
    |
    v
state transition
    |
    v
new world state
    |
    v
events/consequences/output
```

This is more fundamental than classifying the action as "MUD" or "MUSH."

## 8. Sessions and Networking

The engine needs the concept of a player/session, but networking should not be embedded directly in the core. See [SESSION_BOUNDARY.md](./SESSION_BOUNDARY.md) for the detailed design investigation: the `SessionId`/`PrincipalId`/`EntityId` identity model, why `Session` is not a socket, and the open questions (chiefly semantic output) a small implementation proof still needs to answer.

Conceptually:

```text
Connection
    |
    v
Protocol
    |
    v
Session
    |
    v
Player/entity
    |
    v
Game engine
```

The engine manages the session's relationship to the world.

Networking implementations can provide:

- TCP
- TLS
- WebSocket
- local console
- other transports

Telnet is a protocol implementation over a network connection, not the definition of networking.

Potential protocol/presentation systems include:

- Telnet
- GMCP
- MCP
- Pueblo
- VT100/ANSI
- MXP
- future protocols

The engine should produce semantic output rather than terminal-specific escape sequences.

## 9. Adapters / Game Profiles

The adapter boundary should not require every MUD or MUSH family to implement the same machinery from scratch.

Instead, an adapter should increasingly function as a game profile that:

- selects systems
- supplies defaults
- configures rules
- constrains authority
- establishes game semantics
- selects and configures the execution policy (see section 16)

Conceptually:

```text
Adapter / Game Profile
        |
        +-- features enabled
        +-- rules
        +-- permissions/authority
        +-- defaults
        +-- game-specific semantics
```

A game profile can therefore select a combination such as:

```text
MUD-like:
  combat
  progression
  NPCs
  loot
  population
  economy

MUSH-like:
  social interaction
  roleplay
  building
  scripting
  optional combat

MOO-like:
  objects
  properties
  verbs
  inheritance
  scripting
  building
```

These are examples, not rigid categories.

Selecting systems is not enough to define a game family. Diku-, MUSH-, MOO- and MUCK-style games also differ in their execution semantics: how queued work is ordered, what a pulse or tick means, how waiting and waking work, how much work may run per unit of time. An adapter therefore selects and configures the execution policy as well (section 16).

A custom game can combine systems from multiple traditions without requiring a new monolithic adapter.

## 10. Domain Systems / Silos

Optional game systems should live in their own silos rather than being implemented directly inside the core.

Examples:

- Combat
- Social systems
- Population
- Progression
- Magic
- Economy
- Crafting
- NPC behavior
- Scripting
- Quests
- Narrative systems
- Building

Conceptually:

```text
                    CORE
                      |
       +--------------+--------------+
       |              |              |
    Combat          Social       Scripting
       |              |              |
    Economy        Narrative      Building
       |              |              |
    Progression    Factions       Magic
```

Each domain system should:

- depend on core abstractions
- own its own rules/state where appropriate
- expose a clear interface
- consume engine events
- emit engine events
- be optional
- support multiple rules implementations where appropriate

The core should provide extension/capability points without importing every optional domain system.

## 11. Combat Architecture

Combat is an especially strong example of a reusable domain silo.

Many traditional MUD combat systems share a common structure even though individual games differ.

Combat should therefore be a separate subsystem rather than being implemented separately in every MUD adapter.

Conceptually:

```text
Combat subsystem
    |
    +-- common encounter model
    +-- participants
    +-- targets
    +-- actions
    +-- effects
    +-- lifecycle
    +-- events

Rules models
    |
    +-- Diku-style
    +-- turn-based
    +-- freeform
    +-- custom
```

Multiple adapters can reuse the same combat implementation or different combat rules models.

The same architectural idea can apply to other domain systems.

## 12. Population / Spawning

Traditional MUDs commonly have reusable prototypes and live instances.

The core should understand the underlying lifecycle:

```text
prototype
    |
    v
instance
    |
    v
live world
    |
    v
destroy/despawn
```

A population/reset system can then provide MUD-specific behavior such as:

- zone resets
- spawn tables
- population limits
- respawn timers

The underlying entity lifecycle should remain more general so MOO/MUSH/MUCK-style object cloning and creation can use the same machinery.

## 13. Player Construction / World Building

Building is not an administrative edge case in these systems.

Some games intentionally grant players restricted "wizard" capabilities, allowing them to:

- create rooms
- create objects
- create exits
- change properties
- establish ownership
- create behaviors/scripts
- destroy objects

These are normal world-state transitions subject to authority.

The engine should therefore support them as part of the general world model rather than treating them as database administration.

## 14. Behavioral / Scriptable Objects

Some systems allow objects to become behaviorally significant rather than merely containing data.

The architecture should eventually support:

- properties
- commands/verbs
- triggers
- scripts
- autonomous behavior

This should likely become a dedicated scripting/behavior domain rather than being embedded in the fundamental entity representation.

## 15. Persistence

Storage is an implementation boundary.

Potential implementations:

- YAML
- JSON
- SQLite
- PostgreSQL
- other databases
- remote persistence

The core should define the semantics required for loading, saving, mutation persistence, and possibly transactions, while remaining independent of the storage technology.

## 16. Execution Substrate, Execution Policy and the Work Model

Traditional games disagree about the internal semantics of events and actions. A Diku-style game runs phases on a pulse. A MUSH queues commands per object and lets them wait on semaphores. A MOO suspends and forks tasks under tick budgets. The core must not pick one of these. It provides an **execution substrate**, and the adapter supplies the **execution policy** that gives the substrate its semantics.

```text
                      CORE: execution substrate (Runtime)
                                    |
              +---------------------+---------------------+
              |                     |                     |
            Tasks                 Clocks              Scheduling
              |                     |                     |
              +---------------------+---------------------+
                                    |
                            Execution Policy
                     (selected by the adapter)
                                    |
              +---------------------+---------------------+
              v                     v                     v
         Diku / Circle          MUSH / MUX            MOO / MUCK
```

### Mechanism and policy

The substrate provides mechanisms:

- a task registry, following `Work -> Submission -> TaskAdmission -> Task -> TaskRecord`: `Work` (`libs/work`) is what to do, a `kind` and an `input`. A `Submission` (`libs/submission`) is a request to have a `Work` executed. `TaskAdmission`, local to `engine/core`, is a `Submission` plus the admission-time extras this runtime still needs (`lane`, `tags`, `priority`). The engine admits a `TaskAdmission` into a `Task` (`libs/task`): `id`, `work`, `sequence`, `priority`, executed by a handler registered for its kind. `priority` is admission-time execution metadata, an intrinsic ordering attribute of the execution, which is why it is on `Task` while `lane` is not: `lane` is runtime queue membership, not part of what the task is. `TaskRecord`, in `engine/core`, is the runtime's mutable state around one `Task`: its lifecycle state, its queue (`lane`, `tags`) and its execution state. A `Schedule` is a separate, one-time input alongside admission (`Runtime.submit(admission, schedule)`), not a property of `Submission`, `TaskAdmission` or `Task`: it answers "when should this become eligible", is resolved once to decide whether a `TaskRecord` starts `ready` or `pending`, and only its resolved outcome (`via`) is kept. This is unrelated to `wake`, which returns an already-admitted, waiting task to ready with no clock involved: `Schedule` is temporal eligibility and waiting is logical eligibility, and the two stay separate rather than being unified under one generic mechanism. The identifier values (`TaskId`, `TaskPriority`, `TaskSequence`) live in `libs/primitives`
- named clocks, injected as instances (`libs/clock`), each with its own units
- timelines, which release scheduled tasks when their clock reaches them
- queues (lanes) holding ready work
- the task lifecycle, cancellation, outcomes, and containment of handler failures
- execution mechanics: running one step at a time

The execution policy decides how they are used:

- **queue selection and ordering**: which ready task runs next, including whether lanes are independent or merged into one order
- **priority and fairness** between lanes and tasks
- **ordering between clocks**: tasks on different clocks are not ordered by the substrate, because clock units are not comparable, so a policy establishes any relationship explicitly
- **budgets and boundaries**: how much work runs per step, pulse or round; a policy may decline to run ready work
- **inline execution**: whether, and how deeply, a task may run another task immediately (`context.run`) rather than deferring it (`submit`)

Two entry points express the difference in execution style: `submit` defers work, and `context.run` executes it inline as part of the current step. Whether a game may use inline execution is a policy decision.

The substrate records facts and imposes no order of its own. For each ready task it records the batch in which the task became ready and, if the task waited on a clock, the time it was due. `oldestReady` is a default policy that runs the earliest-ready task across all lanes. It is one policy among possible ones, not the definition of the substrate.

### The work model

Every unit of work is in exactly one state:

| State | Meaning | Status |
|-------|---------|--------|
| pending | Waiting for its scheduled time to arrive, before ever running | implemented |
| ready | May run, waiting for the policy to choose it | implemented |
| running | Its step is executing | implemented |
| scheduled | Ran at least once and asked to become eligible again at a scheduled time | implemented |
| waiting | Suspended on something other than time: an event, a condition, input or a semaphore | implemented |
| completed | Finished normally | implemented |
| failed | Its handler threw | implemented |
| cancelled | Cancelled before or during execution | implemented |

A task reaches `ready` through its `Schedule`: temporal eligibility, resolved once at admission (`now`, `after` and `at` exist). This is not the same concept as a trigger in the traditional sense (a property change, a command, an object event, a semaphore, a timer) that causes `Work` to exist in the first place: that is a `Source`/`Event`, outside this substrate, and the term "trigger" is deliberately not used for the engine's own scheduling instruction, to keep the two apart. Still to be defined generically, before any game adapter is written:

- **the rest of the handler outcomes**: a handler can suspend a task into `waiting`, and `runtime.wake(id)` makes it ready again with the continuation it suspended with. A handler can also reschedule a task into `scheduled`, reusing `Schedule` itself: the same task, the same id and sequence, asking to become eligible again at a temporal point of its own choosing. The core stores no reason for a wait, so an adapter keeps its own map from a semaphore, event or prompt to task ids. Yield is still to come, and would use the same outcome mechanism.
- **recurring work**: not a separate mechanism. A handler that returns `reschedule` every time it runs is recurring work; period tracking, drift and what happens to a missed repetition are the adapter's own bookkeeping, carried in its continuation, not something core tracks.
- **logical boundaries and phases**: an adapter can say "at pulse boundary P, execute phase X" and establish the ordering between phases. The core provides the boundary and ordering primitives; it does not contain a Diku scheduler.
- **priority, fairness and execution budgets** as policies over the existing selection point.

The rule for each of these is the same: the core adds a generic mechanism, and the adapter's policy interprets it.

### Events

Events report what has already happened and never decide it. Authoritative work goes through the execution substrate; events let other components react to the result. Domain systems should use these mechanisms instead of implementing their own timing or event infrastructure.

### Determinism

The logical engine is deterministic for a given input history and execution policy. See [DETERMINISM.md](./DETERMINISM.md).

## 17. Robustness Principles

For a live server with potentially dozens or hundreds of players:

- Do not assume a client is fast.
- Do not let one connection block the world.
- Do not let arbitrary async callbacks mutate shared state without control.
- Keep an authoritative owner for live state.
- Use controlled state transitions.
- Contain plugin/domain failures where possible.
- Treat persistence as potentially slow or unavailable.
- Handle backpressure.
- Provide cancellation/timeouts where appropriate.
- Support graceful shutdown.
- Make recovery/restart behavior explicit.
- Keep observability available.
- Keep the logical engine deterministic, and treat environmental timing and external I/O as inputs to it ([DETERMINISM.md](./DETERMINISM.md)).

The initial runtime can remain a single process/event loop if that is appropriate. The domain model should not depend on that assumption.

## 18. Runtime Independence

Node/TypeScript is the initial implementation environment, not the definition of the architecture.

The conceptual model should remain based on:

- world
- state
- action
- rule
- authority
- transition
- event
- session
- persistence
- output

The runtime can later use additional workers, processes, or another implementation strategy without fundamentally changing the domain model.

## 19. Architectural Principle

The current preferred boundary is:

> Core provides the execution substrate and the traditional world machinery.
>
> Adapters/game profiles define game semantics, select the execution policy, and select, configure and constrain domain capabilities.
>
> Plugins provide replaceable infrastructure and integrations: storage, networking, protocols and similar boundaries.
>
> Libs provide private reusable support code.

This is preferred over making each adapter a self-contained implementation of an entire game.

## 20. Monorepo Architecture

The repository should reflect architectural roles rather than putting every workspace under a generic `packages/` directory.

The current proposed workspace categories are:

```text
/
├── apps/
│   ├── cli/
│   └── server/
│
├── engine/
│   └── core/
│
├── libs/
│   ├── types/
│   ├── primitives/
│   ├── utils/
│   ├── config/
│   └── ...
│
├── adapters/
│   ├── mud/
│   ├── moo/
│   ├── muck/
│   ├── mush/
│   └── mux/
│
├── plugins/
│   ├── networking/
│   ├── storage/
│   └── ...
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── turbo.json
```

### Apps

`apps/` contains executable application compositions.

- `apps/server` is the normal game-server entry point.
- `apps/cli` provides command-line interaction and operational/development tooling.

Applications compose the engine, adapters, plugins, and libraries. They should not own the underlying game logic.

### Engine

`engine/` contains the actual game/world runtime.

The engine should initially remain a coherent workspace rather than splitting every responsibility into a separate package. Its internal responsibilities include:

- authoritative world state
- state transitions
- rules and authority enforcement
- events and scheduling
- player/session interaction
- world I/O
- engine lifecycle
- reliability and concurrency

These are engine responsibilities, not necessarily separate workspace boundaries.

### Libs

`libs/` contains private shared implementation code:

- private modules
- primitives
- global/shared types
- reusable utilities
- configuration and possibly other shared configuration packages

Everything under `libs/*` should initially use:

```json
{
  "private": true
}
```

The purpose of `libs/` is to provide reusable internal support code, not to represent major engine architecture.

### Adapters

`adapters/` contains flavors of game.

Examples include:

- MUD
- MOO
- MUCK
- MUSH
- MUX

An adapter is a game profile. It selects/configures the applicable rules, defaults, authority model, semantics, and available capabilities.

Adapters do not implement an entire engine independently.

### Plugins

`plugins/` contains replaceable implementations and integrations that the engine can use.

Examples include:

- networking implementations
- storage implementations
- persistence implementations
- protocol implementations
- other infrastructure integrations

For example:

```text
plugins/
├── networking/
│   ├── telnet/
│   └── websocket/
│
└── storage/
    ├── yaml/
    ├── sqlite/
    └── postgres/
```

The engine remains the authority over live state. Plugins provide implementations at the engine's defined boundaries rather than directly owning authoritative world state.

### Domain Capabilities

Terms such as "domain system" remain useful architectural concepts for capabilities such as combat, population, scripting, social interaction, economy, and progression.

They do not require a separate top-level `systems/` workspace category. Where a capability lives has not been decided: `plugins/` is for replaceable infrastructure and integrations, not for gameplay domains by default. A domain capability will be placed when its ownership and dependencies are clear.

The important distinction is:

- **Engine** — runs the authoritative world and provides the execution substrate.
- **Adapter** — defines the game flavor/profile, including its execution policy.
- **Plugin** — supplies replaceable infrastructure and integrations.
- **Lib** — supplies private reusable support code.
- **App** — composes these into an executable.

The repository should avoid introducing a workspace category merely because a concept exists in the architecture. Workspace boundaries should follow actual ownership and dependency boundaries.

### Conceptual Composition

```text
                         APP
                          |
                    +-----+-----+
                    |           |
                  ENGINE      ADAPTER
                    |           |
                    |       game flavor
                    |
              +-----+------+
              |            |
        authoritative   plugins
           runtime     implementations
              |
             libs
```

The engine owns the live game runtime. The adapter supplies game semantics and configuration. Plugins provide replaceable infrastructure or other capabilities at defined boundaries. Libraries provide private shared implementation support.

### Current transition state

The repository is between its earlier layout and the layout above. This is a transition, not the target.

- `engine/core`, `engine/world`, `engine/sessions`, `libs/clock`, `libs/entity`, `libs/base` and `libs/capabilities` follow the target layout. `base` and `capabilities` (the logging and events contracts, `Base`'s contextual logger) moved from `packages/` to `libs/` once nothing else was undecided about them. Whether the concrete `tslog`/`emittery` adapters inside `capabilities` should eventually split out into their own plugins is still open, and not acted on: `plugins/` has no established member yet, and nothing currently needs that split.
- `engine/world`'s `EngineState` composes `WorldState` (required) and, now, `Sessions` (optional): `readonly world: WorldState; readonly sessions?: Sessions`. `Runtime` can execute against it: `RuntimeOptions.engineState` threads `world` through to `TaskContext.world` and `sessions` through to `TaskContext.sessions`, proven end to end by `engine/core`'s "vertical slice" test for `world` (`Input -> Work -> Task -> Runtime -> TaskHandler -> EngineState -> WorldState -> Output`, with a trivial one-room, one-command domain — the point was the wiring, not the game) and, once `@stratamu/adapter-test` existed to own a real `sessions` consumer, its "session lifecycle" probe for `sessions`. `WorldState` now also tracks location (`locate`/`locationOf`) and, as a pure query over that same data, occupancy (`occupants`) — `@stratamu/adapter-test`'s "world movement" and "world messaging" probes (originally `engine/core` proofs, relocated alongside "session lifecycle" and two others once the adapter existed to exercise: see that package's README), the second of which settled that multi-recipient fan-out needs no `MessageBus`/`EventBus`: `for (const recipient of recipients) { recipient.send(...) }` was enough, once occupancy could be queried and a small map resolved recipients. That map started as `world-messaging`'s test-local `Active` (`EntityId -> Session`) and is now `@stratamu/engine-sessions`'s `Sessions` (`SessionId -> Session`, with `activeFor(principalId)`): a real, reusable session-lifecycle registry, built once "session lifecycle" (open → assign `SessionId` → associate `PrincipalId` → control an `EntityId` → active → receive output → disconnect → inactive) needed one, the same way `WorldState.locate`/`occupants` were built once movement and messaging needed them. `Sessions` deliberately tracks only "who is reachable right now"; "who owns what" stays `Control` (`PrincipalId -> EntityId`), still an adapter-local `Map`, not folded in — the two have different lifetimes, and a disconnect touches only `Sessions`, never `Control`, never `WorldState`. From "vertical slice" through "session lifecycle", each of these is now called a domain probe, not a proof of infrastructure: the substrate is mature enough that the most valuable information comes from what an actual game operation demands of it, not from proving another mechanism works. `Authority`, named alongside `WorldState` and `Sessions` in the `Engine` sketch above, is still not built and has no design yet; it gets built once a real slice shows what it needs to do. Until it exists, `WorldState` is an internal authoritative data structure, not a public game API: nothing stops a handler from mutating it through `context.world` directly.
- `engine/core` now has a real `Engine` class (`composition/engine.ts`), the first concrete piece of the `Engine` sketch above (`Runtime`, `WorldState`, `Sessions`, `Adapter`) to exist as actual code, not a diagram. It composes exactly what every domain probe's own `setup()` had been assembling by hand: a fresh `WorldState`, a fresh `Sessions`, a `Runtime` constructed against both, and an adapter's handlers registered against that `Runtime` once, at construction. Takes an `EngineAdapter` (`{ registerHandlers(runtime): void }`) -- deliberately narrower than the fuller adapter contract `@stratamu/adapter-test`'s `TestAdapter` implements, since `Engine` never calls `parse`: routing input through an adapter to get `Work` stays the caller's concern, not something `Engine` owns. Proven against a real adapter, not a stub, by `@stratamu/adapter-test`'s `engine-composition.test.ts`: the same `look`/`move`/`say` behavior, now composed through `Engine` instead of by hand, changes nothing. This is a composition seam, not the engine *lifecycle* (start/stop/run-loop sequencing) `engine/core`'s own README still means by that phrase in its "Not yet" list — `Engine` has no lifecycle beyond construction. `Authority`, the remaining unbuilt piece of the sketch, still has no design yet.
- `engine/events`, `engine/lifecycle` and `engine/rules` remain empty. They are not workspaces, and a directory becomes a package only when its responsibility is established.
- `docs/*` has been removed from `pnpm-workspace.yaml`: it matched nothing (documentation, not workspace packages), the same reason `packages/*` was removed once `base` and `capabilities` moved out of it and nothing else needed it.

## 21. Git Workflow

Repository workflow:

```text
main
  |
  +-- initial commit
        |
        v
      develop
        |
        +-- feature branches
        +-- architecture work
        +-- refactors
        +-- implementation
              |
              v
             PR
              |
              v
            main
```

`develop` is the integration branch for ongoing work.

`main` represents stable/released history.

## 22. Current Architectural Goal

Before implementing specific MUD/MUSH/MOO features, establish:

1. Core engine boundaries.
2. World/state model.
3. Controlled state-transition mechanism.
4. Execution substrate, execution policy and the work model (section 16).
5. Session/player I/O.
6. Persistence boundary.
7. Networking boundary.
8. Adapter/game-profile boundary.
9. Domain-system/capability boundary.
10. Rules/authority boundary.
11. Concurrency and resilience model.
12. Engine startup and shutdown lifecycle.
13. Monorepo ownership and dependency boundaries.

Then build representative capabilities (such as combat, population, or social behavior) using those boundaries.

## 23. Working Definition

The current working definition of the project is:

> A robust, persistent, multi-user world runtime that manages its own lifecycle, maintains authoritative state, processes concurrent actions, applies rules and authority, coordinates time and events, and manages reliable information flow between the world and its participants.

The engine should be capable of managing traditional MUD/MUSH/MOO/MUCK-style game operations without requiring every game family to reimplement the same underlying machinery.
