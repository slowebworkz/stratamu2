# @stratamu/task

`Task`: the canonical, immutable description of one admitted execution instance.

**Status:** working. Private and unpublished. Used by `engine/core`.

## Where it sits

```text
Work            what should happen                    (@stratamu/work)
  ↓
Submission      how the request enters execution       (@stratamu/submission)
  ↓
TaskAdmission   Submission + this runtime's own admission-time extras   (engine/core, an engine-local type)
  ↓
Task            what the engine admitted                (this package)
  ↓
TaskRecord      mutable runtime state around one Task    (engine/core)
  ↓
Runtime
```

## What exists

- `Task<W extends Work = Work>`: `{ readonly id, readonly work, readonly sequence, readonly priority }`.

`id` and `sequence` are assigned once, at admission, and never change. `priority` is admission-time execution metadata: an intrinsic ordering attribute of this execution, required because the engine must decide it at admission, even if the execution policy in use chooses to ignore it.

"Canonical" is about shape, not storage. This is persistable data, but whether a queued task is actually persisted across an engine restart is a separate decision, not yet made.

## Deliberately not here

- **`lane` and `tags`.** Unlike `priority`, they are not intrinsic to the execution: `lane` is runtime queue membership, a fact about where a task is being run, not what it is. They live on the engine's `TaskRecord` instead.
- **The trigger that scheduled the task.** It is a one-time decision, consumed once to decide whether a task starts `ready` or `pending`, not a durable property of it. `engine/core` does not currently keep it anywhere once consumed; only its resolved outcome does, as `TaskRecord.via`.
- **`TaskState`.** It exists in `@stratamu/primitives`, but it is lifecycle, not this canonical description. The engine's `TaskRecord` carries it alongside a `Task`, not `Task` itself.
- **Continuation and execution state** (an abort controller, a promise, a handler). Those are runtime-only and belong to `TaskRecord`.

None of these are added speculatively. They are added once there is a concrete need.

## Notes

`tsconfig.json` sets `types: ["node"]` because the tests use `vitest`, whose types need Node globals, and TypeScript 6 does not load `@types/node` by default.
