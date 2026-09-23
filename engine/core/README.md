# @stratamu/engine-core

The core engine's **execution substrate**: tasks, clocks, timelines, queues and the mechanics of running work. It provides mechanisms and imposes no game semantics. An adapter supplies the execution policy that decides how they are used. See section 16 of [the architecture](../../docs/GAME_ENGINE_ARCHITECTURE.md).

**Status:** prototype. Private and unpublished.

## What exists

Admitting a task follows a ladder, each stage its own package:

```text
Work            what should happen                    (@stratamu/work)
  ↓
Submission      how the request enters execution       (@stratamu/submission)
  ↓
TaskAdmission   Submission + this runtime's own admission-time extras   (this package, task/task-admission.ts)
  ↓
        +---------------------+---------------------+
        ↓                                           ↓
   Schedule (this package, schedule/)          Task (@stratamu/task)
   when it first becomes eligible               what the engine admitted
        ↓                                           ↓
        +---------------------+---------------------+
                              ↓
                        TaskRecord (this package, runtime/record.ts)
                              ↓
                           Runtime
```

- `Runtime`: submit tasks (`submit`), run them inline (`context.run`), take steps (`step`, `drain`), wake a waiting task (`wake`), cancel by handle, lane or tag.
- `Runtime.submit(admission, when?)` takes a `TaskAdmission`: a `Submission` plus the admission-time extras this runtime still needs for its own queueing and cancellation (`lane`, `tags`, `priority`). Their ownership is not settled at the `Submission` level, so they stay local to `TaskAdmission` rather than joining it. `Runtime` **admits** the `TaskAdmission` into a `Task` (assigning its identity, its place in creation order, and a priority — the lowest, if none was given) and wraps it in a `TaskRecord`.
- `when` (a `Schedule`) is a separate argument, not part of `TaskAdmission`: it is a one-time decision, consumed once to decide whether the new `TaskRecord` starts `ready` or `pending`, not a property of the task itself. It is not currently kept on `TaskRecord`; only its resolved outcome is, as `via`. It is deliberately not called a "trigger": a traditional trigger (a property change, a command, an object event, a semaphore, a timer) causes `Work` to exist in the first place, which is a different, unmodelled concept (`Source`/`Event`) from "when an already-admitted task first becomes eligible."
- Handlers are registered by `WorkKind`, and read `task.work.kind` / `task.work.input`.
- Named clocks, attached as instances (see [`@stratamu/clock`](../../libs/clock)). Any `Clock` whose readings are whole numbers works: a manual clock for logical time, a monotonic clock for real time. The runtime reads a clock as a safe integer and throws if it moves backwards, so a wall clock is not for scheduling.
- `Timeline`: `insert`/`takeDue`/`nextDueAt`/`remove`, one per clock. A set of items, not a multiset: `remove(item)` identifies an item by itself, not by which `insert` call produced it, so `insert` throws if the item is already scheduled — reschedule it by removing it first. Backed by a binary heap (`mnemonist`) rather than a sorted array, for O(log n) insert instead of O(n). Exposes only its own concept, never `mnemonist`'s: `mnemonist` is restricted to `src/timeline/timeline.ts` by this package's own ESLint config (see `@stratamu/eslint`'s README), the same way `guardz` is restricted to `@stratamu/primitives` — an implementation dependency stays replaceable, not part of the architecture's own vocabulary.
- Schedules: `schedule.now` (`ImmediateSchedule`), `schedule.after(delay, clock)` (`RelativeSchedule`), `schedule.at(time, clock)` (`AbsoluteSchedule`) — three separate interfaces, not one shape with optional fields, so a `switch` on `kind` narrows to the fields each one actually has.
- Task states: `pending` (waiting for its time, before ever running), `ready`, `running`, `scheduled` (ran at least once and asked to become eligible again at a scheduled time), `waiting` (suspended on something other than time), and the final `completed`, `failed` and `cancelled`. A new task is immediately ready, pending or waiting, never scheduled: that state is only reached from running.
- A handler suspends a task with `suspend(continuation?)`, and `Runtime.wake(id)` returns it to ready with that continuation. Core stores no reason for the wait; an adapter maps its own reason (a semaphore, an event, a prompt) to task ids. A handler reschedules a task with `reschedule(schedule, continuation?)`, reusing `Schedule`: the same one-time "when should this become eligible" instruction as admission, just made by the task itself rather than whoever submitted it. A rescheduled task keeps its `TaskId` and `sequence` — it is the same `Task` running again, not a new admission. Recurring work is not a separate concept: a handler that returns `reschedule` every time it runs is recurring work.
- `ExecutionPolicy`: the seam that chooses which ready task runs next and whether inline execution is allowed. `oldestReady` is the default policy. Nothing reads a task's `priority` yet.
- `TaskContext.world`: the authoritative `WorldState` a handler executes against, if the `Runtime` was constructed with an `EngineState` (`RuntimeOptions.engineState`, optional — undefined otherwise). `Runtime` threads it through unread: it has no opinion about game state, only about running work. See [`@stratamu/engine-world`](../world) for what `WorldState`/`EngineState` actually are, and `runtime/vertical-slice.test.ts` for the whole path proven end to end, from a submitted `Work` to a handler reading `context.world` to an observable result.
- `TaskContext.sessions`: which sessions are currently active, the same optionality and threading as `context.world` — undefined unless the `Runtime`'s `EngineState` was given a `Sessions`. See [`@stratamu/engine-sessions`](../sessions) for what `Sessions` tracks, and `runtime/session-lifecycle.test.ts` for a handler reading it.
- `runtime/session-boundary.test.ts`: the implementation proof for [SESSION_BOUNDARY.md](../../docs/SESSION_BOUNDARY.md). Confirms `TaskContext` needs no session-related field at all — a session reference travels in `Work.input`, adapter-owned, the same as everything else `Work` carries, and a handler addresses output (to one session, several, or none) by calling it directly.
- `runtime/player-control.test.ts`: the first slice driven by game semantics rather than infrastructure. `PrincipalId -> controlled EntityId -> Session -> Work -> Runtime -> handler -> WorldState -> Session output`, with `look` (reflexive — describes the actor's own entity, no location concept invented to support it) as the first real operation. Confirms control resolves correctly across two isolated principals and across a reconnect (new `SessionId`, same `PrincipalId`, same controlled entity) — again with no change needed anywhere in `engine/core` itself.
- `runtime/world-movement.test.ts`: the first proof that reaches a real `WorldState` mutation, not just a read — a minimal room-to-room move. Answers where the movement rule ("is there a valid exit") lives: nowhere in core, an ordinary `if` in the handler checked before `world.locate` is ever called. `WorldState.locate` refuses only a destination that does not exist (data integrity), never whether a move is allowed (a game rule). No `AuthorityManager`, no rule engine — this is the boundary the movement itself revealed, not one designed in advance. See [`@stratamu/engine-world`](../world)'s `WorldState.locate`/`locationOf`, added for this proof.
- `runtime/world-messaging.test.ts`: a domain probe, not a proof of infrastructure — a minimal multi-recipient `say`. The recipient list is exactly `for (const recipient of recipients) { recipient.send(...) }`: no `MessageBus`/`EventBus`/`Broadcaster` was needed, so none was built. Reveals that fan-out needs *currently connected* sessions, not just ownership: `Control` (`PrincipalId -> EntityId`) survives a disconnect, but a second test-local map, `Active` (`EntityId -> Session`), tracks who is actually reachable right now — a principal can own an entity while offline. See [`@stratamu/engine-world`](../world)'s `WorldState.occupants`, added for this proof: a query over existing location data, not a new relationship.
- `runtime/session-lifecycle.test.ts`: moves `world-messaging`'s test-local `Active` map into a real, reusable `Sessions` (`@stratamu/engine-sessions`), threaded through `TaskContext.sessions` the same way `WorldState` is threaded through `TaskContext.world`. Proves the lifecycle open → assigned `SessionId` → associated `PrincipalId` → controlled `EntityId` → active → receive output → disconnect → inactive, and what a disconnect does and does not do: the principal keeps its `Control` entry, the entity is untouched in `WorldState`, and only the `SessionId` itself stops resolving to anything. `say`'s fan-out is redone here resolving each occupant through `Control` (an occupant's controlling principal) then `Sessions.activeFor` (that principal's active session, if any) — two real steps in place of the old bespoke `EntityId -> Session` map. `Control` itself stays exactly where it was: an adapter-local `Map`, not folded into `Sessions`, because ownership is a game-rule concern and a session's active-or-not state is not.

Source folders each hold one concept, with an `index.ts` barrel: `clock`, `lane`, `policy`, `runtime`, `schedule`, `task`, `timeline`.

## Not yet

- Adapter-level conveniences on top of the reschedule primitive: period tracking, drift, and what happens to a missed repetition. Core only provides the one-shot "run me again at this time" mechanism; anything about a repeating schedule's own bookkeeping is the adapter's, carried in its `continuation`.
- Phases and boundaries, fairness and budgets, and a policy that reads `priority` (the work model in section 16).
- A persistent task model. `Task` (in `@stratamu/task`) is plain data, but `TaskRecord`'s runtime-only `TaskExecution` and its `lane`/`tags` are not stored anywhere.
- The engine lifecycle, and the wall-clock driver that feeds clocks. Both belong to the environment side and have no workspace yet.
- Authority: nothing stops a handler with `context.world` from mutating it directly, bypassing whatever rules a game would want to apply first. `WorldState` is an internal authoritative data structure today, not a public game API with rule-checking in front of it.
- Authentication (a `Session`'s `principalId` is still set once, at construction, by whoever authenticated it — `Sessions` never assigns or checks one) and persistence. Session *lifecycle* itself — which sessions are active, and their effect on fan-out — now exists; see [`@stratamu/engine-sessions`](../sessions).

## Determinism

The runtime reads time only from injected clocks and never reads wall time or randomness. See [DETERMINISM.md](../../docs/DETERMINISM.md).

## Depends on

`@stratamu/base` (logging), `@stratamu/clock`, `@stratamu/engine-sessions`, `@stratamu/engine-world`, `@stratamu/primitives`, `@stratamu/work`, `@stratamu/submission`, `@stratamu/task`, `@stratamu/capabilities`, and `mnemonist` (`Timeline`'s heap, restricted to that one file — see "What exists" above).
