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
Task            what the engine admitted                (@stratamu/task)
  ↓
TaskRecord      mutable runtime state around one Task    (this package, runtime/record.ts)
  ↓
Runtime
```

- `Runtime`: submit tasks (`submit`), run them inline (`context.run`), take steps (`step`, `drain`), wake a waiting task (`wake`), cancel by handle, lane or tag.
- `Runtime.submit` takes a `TaskInput`: a `Submission` plus the admission-time extras the runtime still needs for its own queueing and cancellation (`lane`, `tags`, `priority`). Their ownership is not settled at the `Submission` level, so they stay local to `TaskInput` rather than joining it. `Runtime` **admits** the submission into a `Task` (assigning its identity, its place in creation order, and a priority — the lowest, if none was given), wraps it in a `TaskRecord`, and hands it to its trigger, which decides whether it starts `ready` or `pending`.
- Handlers are registered by `WorkKind`, and read `task.work.kind` / `task.work.input`.
- Named clocks, attached as instances (see [`@stratamu/clock`](../../libs/clock)). Any `Clock` whose readings are whole numbers works: a manual clock for logical time, a monotonic clock for real time. The runtime reads a clock as a safe integer and throws if it moves backwards, so a wall clock is not for scheduling.
- Triggers: `now`, `after`, `at`.
- Task states: `pending` (waiting for its time), `ready`, `running`, `waiting` (suspended on something other than time), and the final `completed`, `failed` and `cancelled`. A new task is immediately ready, pending or waiting. A handler suspends a task with `suspend(continuation?)`, and `Runtime.wake(id)` returns it to ready with that continuation. Core stores no reason for the wait; an adapter maps its own reason (a semaphore, an event, a prompt) to task ids.
- `ExecutionPolicy`: the seam that chooses which ready task runs next and whether inline execution is allowed. `oldestReady` is the default policy. Nothing reads a task's `priority` yet.

Source folders each hold one concept, with an `index.ts` barrel: `clock`, `lane`, `policy`, `runtime`, `task`, `timeline`, `trigger`.

## Not yet

- Recurring work, phases and boundaries, fairness and budgets, and a policy that reads `priority` (the work model in section 16).
- A persistent task model. `Task` (in `@stratamu/task`) is plain data, but `TaskRecord`'s runtime-only `TaskExecution` and its `lane`/`tags` are not stored anywhere.
- The engine lifecycle, and the wall-clock driver that feeds clocks. Both belong to the environment side and have no workspace yet.
- World, rules, sessions and persistence.

## Determinism

The runtime reads time only from injected clocks and never reads wall time or randomness. See [DETERMINISM.md](../../docs/DETERMINISM.md).

## Depends on

`@stratamu/base` (logging), `@stratamu/clock`, `@stratamu/primitives`, `@stratamu/work`, `@stratamu/submission`, `@stratamu/task`, and `@stratamu/capabilities`. The last is part of the transition described in the architecture document.
