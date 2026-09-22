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
- Schedules: `schedule.now` (`ImmediateSchedule`), `schedule.after(delay, clock)` (`RelativeSchedule`), `schedule.at(time, clock)` (`AbsoluteSchedule`) — three separate interfaces, not one shape with optional fields, so a `switch` on `kind` narrows to the fields each one actually has.
- Task states: `pending` (waiting for its time, before ever running), `ready`, `running`, `scheduled` (ran at least once and asked to become eligible again at a scheduled time), `waiting` (suspended on something other than time), and the final `completed`, `failed` and `cancelled`. A new task is immediately ready, pending or waiting, never scheduled: that state is only reached from running.
- A handler suspends a task with `suspend(continuation?)`, and `Runtime.wake(id)` returns it to ready with that continuation. Core stores no reason for the wait; an adapter maps its own reason (a semaphore, an event, a prompt) to task ids. A handler reschedules a task with `reschedule(schedule, continuation?)`, reusing `Schedule`: the same one-time "when should this become eligible" instruction as admission, just made by the task itself rather than whoever submitted it. A rescheduled task keeps its `TaskId` and `sequence` — it is the same `Task` running again, not a new admission. Recurring work is not a separate concept: a handler that returns `reschedule` every time it runs is recurring work.
- `ExecutionPolicy`: the seam that chooses which ready task runs next and whether inline execution is allowed. `oldestReady` is the default policy. Nothing reads a task's `priority` yet.

Source folders each hold one concept, with an `index.ts` barrel: `clock`, `lane`, `policy`, `runtime`, `schedule`, `task`, `timeline`.

## Not yet

- Adapter-level conveniences on top of the reschedule primitive: period tracking, drift, and what happens to a missed repetition. Core only provides the one-shot "run me again at this time" mechanism; anything about a repeating schedule's own bookkeeping is the adapter's, carried in its `continuation`.
- Phases and boundaries, fairness and budgets, and a policy that reads `priority` (the work model in section 16).
- A persistent task model. `Task` (in `@stratamu/task`) is plain data, but `TaskRecord`'s runtime-only `TaskExecution` and its `lane`/`tags` are not stored anywhere.
- The engine lifecycle, and the wall-clock driver that feeds clocks. Both belong to the environment side and have no workspace yet.
- World, rules, sessions and persistence.

## Determinism

The runtime reads time only from injected clocks and never reads wall time or randomness. See [DETERMINISM.md](../../docs/DETERMINISM.md).

## Depends on

`@stratamu/base` (logging), `@stratamu/clock`, `@stratamu/primitives`, `@stratamu/work`, `@stratamu/submission`, `@stratamu/task`, and `@stratamu/capabilities`.
