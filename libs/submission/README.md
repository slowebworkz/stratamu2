# @stratamu/submission

`Submission`: a request to have a particular `Work` executed.

**Status:** working. Private and unpublished. Used by `engine/core`, through `TaskAdmission`.

## Where it sits

```text
Source / Event          why did this need to happen? (not modelled; game semantics)
        ↓
Work                     what should happen? (@stratamu/work)
        ↓
Submission               how is this request entering execution?
        ↓
TaskAdmission            Submission + this runtime's own admission-time extras (engine/core)
        ↓
              +----------------+----------------+
              ↓                                 ↓
       Schedule (engine/core)              Task (@stratamu/task)
       when eligible                       what execution instance
              ↓                                 ↓
              +----------------+----------------+
                               ↓
                         TaskRecord (engine/core)
```

`Source`/`Event` and `Schedule` are named here to place `Submission` among them, not because this package models them. A `Source`/`Event` doesn't have to flow through this chain at all: a player command can produce a `Submission` directly, and a timer can produce one with a `Schedule` alongside it. `Schedule` answers "when should this admitted execution first become eligible" and is a separate, one-time argument to admission, not a property of `Submission`: the same `Submission` could be admitted now, after a delay, or at an absolute time without changing the work at all. See `engine/core`'s `Schedule`.

## What exists

- `Submission<W extends Work = Work>`: `{ readonly work: W }`.

That is deliberately the whole of it for now. The full shape is not yet defined: traditional systems suggest a submission may eventually need to carry who or what caused the request, who should execute it, execution context, arguments or registers. None of those are added speculatively. They are added when something in the engine or an adapter actually needs them.

When it should first become eligible is not on this list: that is settled as `Schedule`, a separate argument to admission, kept out of `Submission` on purpose (see the diagram above).

## Not yet

- Everything beyond `work` above.
- A constructor function, if one turns out to be useful once there is more than one field.
- `engine/core`'s `TaskAdmission` composes this type (`extends Submission<W>`) rather than duplicating it, adding only `lane`, `tags` and `priority`: the admission-time extras the runtime still needs for its own queueing and cancellation, whose ownership is not settled at this level.

## Notes

`tsconfig.json` sets `types: ["node"]` because the tests use `vitest`, whose types need Node globals, and TypeScript 6 does not load `@types/node` by default.
