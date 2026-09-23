# Session Boundary

## Status

**Investigation / Design — implementation proof complete.**

This document defines the intended boundary between external participants and the game engine. It establishes the identity model, responsibilities of `Session`, input flow, relationship to authoritative engine state, and the questions that remain open before implementation.

The proof called for in section 15 exists: `engine/core/src/runtime/session-boundary.test.ts`, alongside `SessionId`/`PrincipalId` in `libs/primitives`. See "Findings from the Implementation Proof" below for what it settled. `Session` itself is now a real, reusable type — `@stratamu/engine-sessions` — promoted once session *lifecycle* (`engine/core/src/runtime/session-lifecycle.test.ts`) gave it a concrete consumer beyond this proof; see the "Update, from a later probe" note in that section. What still isn't committed: a normalized-input representation, and anything about receiving more than one kind of output.

## Findings from the Implementation Proof

The proof (`engine/core/src/runtime/session-boundary.test.ts`) ran the whole path — raw input → `Session` → adapter parser → `Work` → `Runtime` → handler → semantic output → `Session` — with a `Session` kept deliberately local to the test, not a package, because its shape was exactly what the proof existed to discover.

**The main finding: `engine/core` needed no changes at all.** Going in, the open question was whether `TaskContext` would need something new the way it needed `world` for `EngineState` (#24). It didn't. Addressing output — to one session, to several, to none — turned out to need no core concept whatsoever: the adapter already owns `Work.input`, so it carries a session reference there, the same way it owns everything else about what a `Work` means. A handler calls `session.send(...)` directly; `Runtime` never knows a session exists.

This settles section 7's open question in a specific way: output is **not** a `Task` result, and needs no new `TaskOutcome` variant or `TaskContext` field. It's an ordinary side effect a handler performs through whatever the adapter handed it in `Work.input` — proven to support zero recipients (input that doesn't parse to a `Work` produces none), one, and several (a `say`-shaped test: one message to the speaker, a different one to each hearer), all without addressing or fan-out logic living anywhere in core.

The identity separation held under a real compile-time check, not just by naming convention: `SessionId`, `PrincipalId`, `EntityId` and (added to the check as a fourth, previously-established identity) `TaskId` all reject being assigned to one another. A reconnect producing a new `SessionId` while `PrincipalId` stays the same round-tripped correctly through the test-local `Session`.

**Still not committed, deliberately:** the exact minimal `Session` interface as a real, reusable type — `{ id, principalId, send(message) }` is what the proof needed, not necessarily everything a real one needs (lifecycle, input receipt, more than one output method). Promoting it into `libs/primitives`/a new package is the next step once something beyond this proof actually consumes it. Authority remains untouched and out of scope, as before.

**Update, from a later probe:** that "next step" happened once session *lifecycle* gave a concrete consumer. `engine/core/src/runtime/session-lifecycle.test.ts` promotes exactly this shape into `@stratamu/engine-sessions`'s `Session`, and adds `Sessions` (`open`/`get`/`has`/`disconnect`/`activeFor`) as the real, reusable registry `world-messaging.test.ts`'s test-local `Active` map stood in for. Input receipt and more than one output method are still not exercised by anything. See "Open Questions" (section 14) below for the current status of each question this raised.

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

Updated after the implementation proof (see "Findings from the Implementation Proof" above). Marked `Resolved` where the proof gave a real answer, `Open` where it still doesn't.

### Session

- What is the minimum protocol-neutral Session interface? — **Resolved, and promoted to a real type**: `{ id, principalId, send(message) }`, now `@stratamu/engine-sessions`'s `Session`, not a re-declaration local to each test. **Still open**: receiving input, and more than one output channel — neither has a concrete need yet.
- How is normalized input represented? — **Open.** The proof fed raw strings straight to the parser; it never modeled a distinct "normalized input" shape between raw protocol bytes and that.
- How does Session lifecycle interact with engine lifecycle? — **Partially resolved** by `engine/core/src/runtime/session-lifecycle.test.ts` and `@stratamu/engine-sessions`'s `Sessions`: `open`/`disconnect` against a real, reusable registry, threaded through `EngineState.sessions` / `TaskContext.sessions` the same way `WorldState` is. Proves the arc open → active → receive output → disconnect → inactive, and that a disconnect touches only `Sessions` — never `Control`, never `WorldState`. **Still open**: the engine lifecycle proper (the wall-clock driver and startup/shutdown sequencing `engine/core`'s README lists as not yet built) — this resolves session lifecycle against `Runtime`/`EngineState`, not against that.
- Where does the Session-to-Principal association live? — **Still open** for a real implementation, but narrowed: `Sessions` (the registry) does not assign or store it — a `Session`'s `principalId` is set once, at construction, by whoever authenticated it, and the registry only ever reads it back (`activeFor`). Where that authentication itself lives remains undecided.
- When does an Entity association become meaningful? — **Resolved by a second proof**, `engine/core/src/runtime/player-control.test.ts`: `PrincipalId -> controlled EntityId`, kept as a plain `Map<PrincipalId, EntityId>`, external to `Session` and keyed on the principal (not the session) specifically so a reconnect — new `SessionId`, same `PrincipalId` — keeps controlling the same entity. Proven, not just asserted: two principals' control stays isolated, a reconnect resolves to the same entity, and a session with no principal or an unmapped principal degrades to "not controlling anything" rather than crashing.

### Output

- Is output a Task result or a separate emission? — **Resolved: a separate emission**, an ordinary side effect through `session.send(...)`, not a `TaskOutcome` variant.
- Can one Work produce multiple outputs? — **Resolved: yes**, proven with a `say`-shaped test (one message to the speaker, a different one to each hearer).
- How are outputs addressed? — **Resolved: via `Work.input`**, the same way `Work` already carries anything else adapter-specific. No addressing mechanism lives in core.
- Is output itself adapter-defined? — **Resolved: yes.**
- Does the Session receive semantic output directly, or is another presentation boundary required? — **Partially resolved.** The engine side needs nothing more than direct receipt (`session.send`). Whether a presentation/protocol layer sits between that and the actual transport is a transport concern, outside what this proof could settle.

### State

- Which Session facts belong in `EngineState`? — **Resolved, narrowly**: `EngineState.sessions: Sessions | undefined` — which sessions are currently active, nothing more. Individual `Session` objects are still never stored inside `EngineState`/`WorldState`; only the registry tracking which ids are active lives there. `sessions` is optional, so an `EngineState` with only `world` still compiles unchanged.
- What belongs exclusively to the protocol/session execution layer? — **Sketched, not finalized.** `Sessions` still has no connection machinery to speak of (no assigning a `SessionId`, no authenticating a `principalId`), so this line still hasn't had to be drawn for real.

---

# 15. Next Step

**Done.** `engine/core/src/runtime/session-boundary.test.ts` is that proof: raw input → `Session` → adapter parser → `Work` → `Runtime` → handler → semantic output → `Session`, with the identity separation (`SessionId ≠ PrincipalId ≠ EntityId ≠ TaskId`) checked at compile time, not just asserted in prose. See "Findings from the Implementation Proof" above for what it settled and what it deliberately still leaves open.

It discovered the smallest contracts for the three things it set out to discover — session input, adapter-owned `Work` construction, semantic output — and, notably, that none of them required a change to `engine/core`.

What it did **not** do, on purpose, matching the same restraint already applied to `WorldState`/`Entity`: build a real, reusable `Session` type, a lifecycle, normalized-input representation, or an `EngineState.sessions`. Those stay open (section 14) until something beyond this proof actually needs them — a second slice, an adapter, or networking work that has a concrete requirement for one of them, not this investigation anticipating it in advance.
