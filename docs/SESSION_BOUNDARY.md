# Session Boundary

## Status

**Investigation / Design**

This document defines the intended boundary between external participants and the game engine. It establishes the identity model, responsibilities of `Session`, input flow, relationship to authoritative engine state, and the questions that remain open before implementation.

The design deliberately does **not** settle the final semantic output model yet. That should be validated through a small implementation proof before becoming an architectural commitment.

---

## 1. Purpose

A `Session` represents an active connection between an external participant and the engine.

It is intentionally **not** a network connection abstraction and does not understand game-specific commands or semantics.

The boundary is:

```text
Protocol / Connection
        │
        │ raw input
        ▼
     Session
        │
        │ normalized session input
        ▼
 Game Adapter / Parser
        │
        │ Work
        ▼
      Runtime
        │
        ▼
    Game Engine
```

The purpose of `Session` is to provide a protocol-agnostic representation of an active participant connection while leaving protocol handling and game semantics to their respective layers.

---

# 2. Participant Identity

Participant identity consists of three distinct concepts.

They must not be collapsed into a single identifier.

```text
SessionId
    │
    │ associates with
    ▼
PrincipalId
    │
    │ currently controls
    ▼
EntityId
```

Each represents a different thing with a different lifetime.

## 2.1 SessionId

`SessionId` identifies a particular connection/session instance.

Properties:

- Ephemeral.
- Assigned when a session opens.
- Invalid once the session closes.
- A reconnect creates a new `SessionId`.
- Represents **this connection**, not the person using it.

It is analogous to `TaskId` in that it identifies an execution/connection instance rather than a durable identity.

```text
Connection A
    ↓
SessionId A

disconnect

Connection B
    ↓
SessionId B
```

The reconnecting participant therefore does not retain the previous `SessionId`.

---

## 2.2 PrincipalId

`PrincipalId` identifies the authenticated principal independently of any particular connection.

Properties:

- Survives reconnects.
- May be associated with multiple sessions over time.
- Represents **who is authenticated**.
- Is not itself a world entity.
- A `Session` associates with a `PrincipalId`; it does not become one.

Conceptually:

```text
PrincipalId: alice
    │
    ├── SessionId: connection-1
    │
    ├── disconnect
    │
    └── SessionId: connection-2
```

The principal remains the same while the session changes.

---

## 2.3 EntityId

`EntityId` identifies an entity in `WorldState`.

A player's in-world avatar is simply an `Entity`.

Nothing about the generic `Entity` abstraction needs to change to accommodate player avatars.

This is important because not every entity has a session.

For example:

```text
Principal
    │
    ▼
Session
    │
    ▼
Player Entity
```

but:

```text
NPC Entity
```

may have no session at all.

Likewise, traditional MU* systems may allow a principal to control multiple entities.

The identity model therefore remains:

```text
SessionId → PrincipalId → EntityId
```

rather than treating those identifiers as interchangeable.

---

# 3. Session Responsibilities

`Session` should remain deliberately thin.

Its responsibilities are limited to representing and routing the interaction between an external connection and the engine.

A `Session` may:

- Identify the current session.
- Maintain its association with a `PrincipalId`.
- Carry normalized input received from the connection.
- Route semantic output toward the connection.
- Participate in session lifecycle transitions.

A `Session` should **not**:

- Parse game commands.
- Know what a command means.
- Construct game-specific `Work`.
- Interpret `WorkKind`.
- Implement game rules.
- Own authoritative `WorldState`.
- Contain a network socket or protocol-specific connection object as authoritative engine state.

The governing principle is:

> **Session transports; adapters interpret.**

---

# 4. Session Is Not a Socket

A protocol implementation may own the actual connection machinery:

```text
Telnet connection
WebSocket connection
CLI stream
Test connection
        │
        ▼
Protocol / Transport layer
        │
        ▼
Session
```

The actual socket, stream, parser state, buffers, and similar connection machinery are ephemeral execution concerns.

They should not become part of authoritative `EngineState`.

This follows the same general separation already established by `TaskRecord`, where live execution machinery is separated from persistent/data facts.

Conceptually:

```text
Session
├── SessionId
├── PrincipalId?
├── controlled EntityId?
└── state facts

Session execution / connection
└── ephemeral protocol machinery
```

The exact implementation split remains to be determined once the Session shape is established.

---

# 5. Input Flow

The engine should not interpret raw protocol input directly.

The intended flow is:

```text
raw protocol input
        │
        ▼
     Session
        │
        │ normalized session input
        ▼
adapter-supplied parser
        │
        │ Work
        ▼
Runtime.submit(...)
```

The Session therefore does not know what constitutes a command.

For example, a textual input such as:

```text
look
```

might eventually become a particular `Work` for one game adapter, while another adapter could interpret the same input differently.

Likewise, a non-command input such as a response to a prompt can be interpreted by the adapter according to the game model.

The adapter owns the mapping:

```text
input → Work
```

This follows the same ownership rule already established for `WorkKind`:

> Game semantics belong to the adapter, not to `Session` or `engine/core`.

---

# 6. Work Construction

`Session` does not construct game-specific `Work`.

Instead:

```text
Session
    │
    │ input
    ▼
Adapter
    │
    │ parse / interpret
    ▼
Work
    │
    ▼
Runtime
```

This preserves the existing abstraction boundary.

The Runtime knows how to execute `Work`, but does not know what a particular `WorkKind` means.

Likewise, Session knows that input arrived, but does not know what that input means.

---

# 7. Output

The final semantic output model remains intentionally open.

A likely direction is a semantic output shape analogous to existing discriminated data structures such as `Work` and `TaskResult`.

For example, a future output could conceptually resemble:

```ts
{
  kind: "...",
  input: ...
}
```

where the output kind is defined by the adapter/game semantics and core infrastructure does not interpret the specific meaning.

This would provide a symmetry:

```text
Work
    kind + input
        │
        ▼
      Engine
        │
        ▼
Output
    kind + input
```

However, this is **not yet an architectural decision**.

The important unresolved question is whether output should be modeled as:

1. a result of Task execution,
2. a separate semantic emission from execution,
3. a stream or collection of semantic emissions,
4. an addressed emission to a Session/entity,
5. or some combination of these.

A small implementation proof should answer this before the output contract is finalized.

---

# 8. Why Output Needs a Separate Proof

A single piece of Work may potentially:

- produce no output,
- produce one output,
- produce multiple outputs,
- produce different output for different recipients,
- mutate world state without producing output,
- produce output without permanently changing world state.

For example, a future `say` operation might conceptually result in:

```text
speaker
    ↓
"You say, \"hello.\""

other occupants
    ↓
"Alice says, \"hello.\""
```

The engine should not need to understand the game-specific meaning of those messages.

The proof should therefore determine whether output is best treated as an execution result or as a distinct semantic emission mechanism.

---

# 9. Relationship to EngineState

`EngineState` currently grows only as actual state concepts are introduced.

`WorldState` is already authoritative game state:

```text
EngineState
└── WorldState
```

Session state may eventually become another component:

```text
EngineState
├── WorldState
└── Sessions
```

However, this should not be added merely because the architecture anticipates it.

The exact state representation should be determined after the Session contract has been established.

The same principle that was applied to `WorldState` applies here:

> Add fields when the corresponding subsystem is actually designed, rather than reserving space for anticipated functionality.

---

# 10. Ephemeral Versus Authoritative Session State

The actual connection machinery should remain outside authoritative engine state.

Conceptually:

```text
EngineState
│
└── session facts
     ├── SessionId
     ├── PrincipalId
     └── Entity association

Protocol / Session execution
│
└── connection machinery
     ├── socket
     ├── stream
     ├── buffers
     └── protocol state
```

The first category represents state that the engine may need to reason about.

The second category represents live infrastructure required to communicate with the external world.

This distinction mirrors the existing `TaskRecord` / `TaskExecution` separation:

```text
TaskRecord
├── task/state/via/etc.
└── execution
     └── ephemeral execution machinery
```

The Session model should preserve the same principle.

---

# 11. Authority Is Deferred

The current engine deliberately allows handlers to operate against `context.world`.

That is appropriate for the current execution substrate and vertical integration work.

However, once player-originated Work exists, an authority/rules boundary becomes important.

Eventually, the conceptual path is likely to become:

```text
Player input
    ↓
Work
    ↓
Handler
    ↓
Rules / Authority
    ↓
WorldState
```

rather than allowing every handler to perform unrestricted world mutations.

This is an identified future pressure point, not part of the Session boundary implementation.

No Authority subsystem should be introduced solely to anticipate this requirement.

---

# 12. Non-Goals

The Session boundary does not currently define:

- Telnet.
- WebSockets.
- Any particular network protocol.
- Authentication implementation.
- Authorization rules.
- Player entities.
- NPC behavior.
- Game commands.
- Command grammars.
- Persistence.
- World entity schemas beyond the existing generic `Entity`.
- Final semantic output representation.
- Authority implementation.

Those belong to later architectural layers.

---

# 13. Current Architectural Flow

The intended architecture is therefore:

```text
                    External World
                          │
                  Protocol / Transport
                          │
                          ▼
                       Session
                          │
                    normalized input
                          │
                          ▼
                    Game Adapter
                    / Parser
                          │
                         Work
                          │
                          ▼
                       Runtime
                          │
                       Task
                          │
                          ▼
                      Handler
                       /    \
                      /      \
                     ▼        ▼
             EngineState    Output
                  │
                  ▼
              WorldState
```

Identity flows separately:

```text
SessionId
    │
    │ associates with
    ▼
PrincipalId
    │
    │ controls
    ▼
EntityId
```

No two of these identifiers represent the same concept.

---

# 14. Open Questions

The remaining questions for this investigation are intentionally narrow.

### Session

- What is the minimum protocol-neutral Session interface?
- How is normalized input represented?
- How does Session lifecycle interact with engine lifecycle?
- Where does the Session-to-Principal association live?
- When does an Entity association become meaningful?

### Output

- Is output a Task result or a separate emission?
- Can one Work produce multiple outputs?
- How are outputs addressed?
- Is output itself adapter-defined?
- Does the Session receive semantic output directly, or is another presentation boundary required?

### State

- Which Session facts belong in `EngineState`?
- What belongs exclusively to the protocol/session execution layer?

These should be resolved through a small proof rather than by introducing abstractions speculatively.

---

# 15. Next Step

The next implementation should be a focused proof of the Session boundary:

```text
raw/normalized input
        ↓
Session
        ↓
adapter parser
        ↓
Work
        ↓
Runtime
        ↓
handler
        ↓
semantic output
        ↓
Session
```

The proof should also preserve the identity separation:

```text
SessionId ≠ PrincipalId ≠ EntityId
```

The purpose of the proof is **not** to build networking or a complete Session subsystem.

Its purpose is to discover the smallest contracts required for:

1. Session input,
2. adapter-owned Work construction, and
3. semantic output.

Once that proof is complete, the resulting contracts can be captured as the stable Session boundary and incorporated into the broader engine architecture.
