# @stratamu/engine-sessions

The engine's **session lifecycle**: which connections are currently active, as distinct from
`@stratamu/engine-world`'s `WorldState` (what exists and where) and an adapter's own `Control`
(who owns what). See the architecture document's `Engine` sketch (`Runtime`, `WorldState`,
`Sessions`, `Authority`, `Adapter`).

**Status:** prototype, deliberately minimal. Private and unpublished.

## What exists

- `Session`: an id and, once associated, the principal behind it (`PrincipalId | undefined`), plus
  `send(message)`. Transport-agnostic and deliberately minimal -- four earlier domain probes
  (session boundary, player control, world movement, world messaging) each re-declared this same
  shape locally because the real shape was one of the open questions those proofs existed to
  inform. It's settled now: this package needed it to be real, not another test file re-declaring
  it. `principalId` is set once, at construction, by whatever authenticated the session -- this
  package neither assigns a `SessionId` nor authenticates anyone.
- `Sessions`: `open`, `get`, `has`, `disconnect`, `size`, `activeFor(principalId)`. Tracks exactly
  one thing: which sessions are active right now. `open` throws on a duplicate `SessionId`, the
  same data-integrity check `WorldState.add` makes for a duplicate `EntityId`. `disconnect` is
  idempotent, the same way `WorldState.remove` tolerates an id that was never there. `activeFor` is
  computed on demand over the active sessions themselves, not a maintained index -- the same
  reasoning `WorldState.occupants` settled on -- and assumes at most one active session per
  principal at a time.

## The distinction this package exists to keep

`Sessions` answers "who is reachable right now" (`SessionId -> Session`). It is deliberately **not**
"who owns what" (`PrincipalId -> EntityId`) -- that stays an adapter's `Control` map, established
by the player-control and world-messaging probes and still not a package, because unlike a
session's own lifecycle, control is a game-rule concern this package has no business deciding.

The two have different lifetimes on purpose:

- A disconnect removes a session from `Sessions` -- and only from `Sessions`.
- It does not touch `Control`: the principal still owns whatever entity it controlled.
- It never touches `WorldState`: the entity still exists, unchanged.

Only the disconnected `SessionId` itself stops resolving to anything. See
`@stratamu/adapter-test`'s `src/probes/session-lifecycle.test.ts` for the proof: principal
survives, entity survives, `SessionId` does not.

## Not yet

- Assigning a `SessionId`, or authenticating a principal. Both stay an adapter's concern, the same
  way `WorldState.add` does not decide whether an entity should exist.
- More than one active session per principal. `activeFor` returns the first match it finds;
  nothing here enforces or resolves the case where more than one exists.
- Persistence. `Sessions` is in-memory, runtime-only state, the same as `WorldState`.

## Depends on

`@stratamu/primitives`.
