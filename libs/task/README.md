# @stratamu/task

`Task`: the immutable, engine-facing description of one admitted execution instance.

**Status:** scaffold. Private and unpublished. Nothing depends on it yet.

## Where it sits

```text
Work           what should happen                    (@stratamu/work)
  ↓
Submission     how the request enters execution       (@stratamu/submission)
  ↓
Task           what the engine admitted                (this package)
  ↓
TaskRecord     mutable runtime state around one Task    (engine/core)
  ↓
Runtime / Scheduler
```

## What exists

- `Task<W extends Work = Work>`: `{ readonly id, readonly work, readonly sequence, readonly priority }`.

`id` and `sequence` are assigned once, at admission, and never change. `priority` is required: the engine must decide it at admission, even if the execution policy in use chooses to ignore it.

## Deliberately not here

- **`lane` and `tags`.** Their ownership is not settled: whether they belong to `Task`, to `Submission`, or only to the engine's own runtime bookkeeping, is an open question.
- **The trigger that scheduled the task**, for the same reason.
- **`TaskState`.** It exists in `@stratamu/primitives`, but it is lifecycle, not durable identity. The engine's `TaskRecord` carries it alongside a `Task`, not `Task` itself.
- **Continuation and execution state** (an abort controller, a promise, a handler). Those are runtime-only and belong to `TaskRecord`.

None of these are added speculatively. They are added once their ownership is settled.

## Notes

`tsconfig.json` sets `types: ["node"]` because the tests use `vitest`, whose types need Node globals, and TypeScript 6 does not load `@types/node` by default.
