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

The engine needs the concept of a player/session, but networking should not be embedded directly in the core.

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

## 16. Events and Scheduling

Events and scheduling are foundational engine infrastructure.

Events can represent things such as:

- entity creation/destruction
- movement
- property changes
- connection/disconnection
- command activity
- domain-system outcomes

Scheduling provides:

- delayed actions
- recurring work
- timers
- world simulation
- combat timing
- scripts
- resets

Domain systems should use these mechanisms instead of implementing unrelated timing/event infrastructure of their own.

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

> Core provides the runtime and traditional world machinery.
>
> Domain systems provide optional gameplay/social/behavioral capabilities.
>
> Adapters/game profiles select, configure, and constrain those systems.
>
> Infrastructure implementations provide storage, networking, protocols, and other external integrations.

This is preferred over making each adapter a self-contained implementation of an entire game.

## 20. Git Workflow

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

## 21. Current Architectural Goal

Before implementing specific MUD/MUSH/MOO features, establish:

1. Core engine boundaries.
2. World/state model.
3. Controlled state-transition mechanism.
4. Events and scheduling.
5. Session/player I/O.
6. Persistence boundary.
7. Networking boundary.
8. Adapter/game-profile boundary.
9. Domain-system/capability boundary.
10. Rules/authority boundary.
11. Concurrency and resilience model.

Then build representative systems (such as combat, population, or social behavior) as separate domain silos using those boundaries.

## 22. Working Definition

The current working definition of the project is:

> A robust, persistent, multi-user world runtime that maintains authoritative state, processes concurrent actions, applies rules and authority, coordinates time and events, and manages reliable information flow between the world and its participants.

The engine should be capable of managing traditional MUD/MUSH/MOO/MUCK-style game operations without requiring every game family to reimplement the same underlying machinery.
