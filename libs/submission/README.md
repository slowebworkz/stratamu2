# @stratamu/submission

`Submission`: a request to have a particular `Work` executed.

**Status:** scaffold. Private and unpublished. Nothing depends on it yet.

## Where it sits

```text
Trigger / Source        why did this need to happen? (not modelled; game semantics)
        ↓
Work                     what should happen? (@stratamu/work)
        ↓
Submission               how is this request entering execution?
        ↓
Task                     what execution instance did the engine create? (engine/core)
```

## What exists

- `Submission<W extends Work = Work>`: `{ readonly work: W }`.

That is deliberately the whole of it for now. The full shape is not yet defined: traditional systems suggest a submission may eventually need to carry who or what caused the request, who should execute it, execution context, arguments, registers, or scheduling hints. None of those are added speculatively. They are added when something in the engine or an adapter actually needs them.

## Not yet

- Everything beyond `work` above.
- A constructor function, if one turns out to be useful once there is more than one field.
- Use in `engine/core`: `Runtime.submit` still takes its own `TaskInput`, which duplicates part of what `Submission` is for.

## Notes

`tsconfig.json` sets `types: ["node"]` because the tests use `vitest`, whose types need Node globals, and TypeScript 6 does not load `@types/node` by default.
