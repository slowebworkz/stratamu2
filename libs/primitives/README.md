# @stratamu/primitives

Small value types shared across the workspaces. Its one runtime dependency is [`guardz`](https://www.npmjs.com/package/guardz), used for type guards.

**Status:** working and tested. Private and unpublished. Used by `@stratamu/clock`, `@stratamu/work`, `@stratamu/entity`, `@stratamu/task`, `@stratamu/engine-core` and `@stratamu/engine-world`.

## What exists

Everything is exported from the package entry.

### Time (`src/time`)

- `Duration<TDomain>`: an amount of time in a temporal domain. `from`, `zero`, `add`, `subtract`.
- `Instant<TDomain>`: a point in a temporal domain. `from`, `zero`, `add` and `subtract` a `Duration` of the same domain, and `durationSince`.
- `Timestamp`: a wall-clock time in milliseconds since the Unix epoch. Its meaning is fixed, so it has no domain. `fromMilliseconds`, `fromNumber`, `fromDate`, `add` and `subtract` (in milliseconds), `toDate`, `toISOString`, `toJSON`.

All three hold a `bigint`, so values stay exact beyond the safe integer range. They share `compare`, `equals`, `isBefore`, `isAfter` and `toString` through an internal base class, `TemporalValue`, which is not exported.

### Task values (`src/task`)

Branded identifiers and orderings for tasks. Each is created with a constructor that validates it, so no cast is needed at the call site, and each serialises as an ordinary JSON value.

- `TaskId`: a string with something in it. `isTaskId` is the matching guard for data that has not been through `taskId`, such as a value read back from storage, and `taskId` uses it, so it needs no cast. `TaskId` and `TaskState` use `guardz`.
- `TaskPriority`: a finite number, with `isTaskPriority`. Whether it exists, and which direction runs first, is the execution policy's decision.
- `TaskState`: the eight states of a task (`pending`, `ready`, `running`, `scheduled`, `waiting`, `completed`, `failed`, `cancelled`). `pending` and `scheduled` are both temporal ("not until time T"), differing only in whether the task has ever run; `waiting` is logical ("not until something happens"). `TASK_STATES` is the list the type is made from, and `isTaskState` is the guard for a state read back from storage.
- `TaskSequence`: a non-negative safe integer that records creation order, with `isTaskSequence`. It is a number so it persists cleanly, and `Number.MAX_SAFE_INTEGER` would take about 285 years at a million tasks a second.

`guardz` is an implementation dependency of this package, not part of Stratamu's own vocabulary. Consumers import the guards from `@stratamu/primitives` (`import { isTaskId } from "@stratamu/primitives"`) and never from `guardz`, which would couple them to an implementation detail. The shared ESLint config enforces this: importing `guardz` is an error everywhere except in this package.

Every value has an `isX` guard next to its constructor, and the constructor uses it, so none of them needs a cast. `guardz` is used where it does the whole job: `isNonEmptyString` for ids and namespaced kinds, and `isOneOf` for states. It is not used for priority or sequence, because its numeric guards are looser than the rules: `isNumber` accepts `Infinity`, and `isNonNegativeInteger` accepts integers beyond `Number.MAX_SAFE_INTEGER`. `Number.isFinite` and `Number.isSafeInteger` are exact, and the tests check both cases.

The rule is to use `bigint` where exact magnitude matters, and a branded number for a bounded counter that needs ordinary JSON.

### Entity values (`src/entity`)

- `EntityId`: a string with something in it, the identity of an entity in a `WorldState`. `isEntityId` is the matching guard, and `entityId` uses it. Mirrors `TaskId` exactly: same shape, same reason (an id cannot be confused with a type or any other string).

### Namespaced kinds (`src/namespaced`)

`isNamespacedKind` is the guard for a namespaced kind: a dotted name in lower case, such as `diku.command` or `mush.wait`. Every kind in the system has this shape, so a MUSH `command` and a Diku `command` cannot collide. `@stratamu/work` builds `WorkKind` on it. The pattern must not have a `g` or `y` flag, because `RegExp.test` would then keep state between calls, and a test checks that repeated calls give the same answer.

### Domains

A domain says what the units mean: `Duration<Pulse>`, `Duration<WallTime>` and `Instant<GameTime>` are different, and mixing them is a compile error. That includes comparing them, adding them, widening `Duration<"pulse">` to `Duration<string>`, and using an `Instant` where a `Duration` is expected.

This relies on a phantom field, `declare protected readonly __domain: (value: TDomain) => TDomain`, which makes the domain parameter invariant. Do not replace it with a simpler brand such as `readonly __brand: TDomain`: that still separates unrelated domains but allows widening. It is `protected` and not `private` because declaration emit drops the type of a private member, and the domain check would then disappear for every package that imports the built code. The clock tests check it across that boundary. The `@ts-expect-error` tests in `duration.test.ts` and `instant.test.ts` guard this, and `pnpm typecheck` fails if the rule stops holding.

Two domain types with the same structure are interchangeable, so use distinct shapes or string literals:

```ts
type Pulse = { readonly kind: "pulse" }
type Wall = { readonly kind: "wall" }
```

### Timestamp

- `fromNumber` requires a safe integer, and `fromDate` rejects an invalid `Date`.
- `toDate` and `toISOString` throw a `RangeError` for a value outside the range of a JavaScript `Date` (±8.64e15 ms) rather than returning an Invalid Date.
- `toJSON` returns the milliseconds as a string.
- It never reads the clock. The caller supplies the `Date` or number.

## Not yet

- `Duration` and `Instant` have no `toJSON`, so `JSON.stringify` writes them as `{}`. Do not put them in data that is persisted or replayed until they do.
- No units, and no conversion between domains (milliseconds to pulses, say). An adapter that defines a pulse length is the natural owner of that.
- `Timestamp.add` takes raw milliseconds, not a `Duration<WallTime>`. That is an API choice that has not been made.
- The engine's triggers and timelines still use plain numbers. `@stratamu/clock` produces these values, and the runtime reads them as safe integers.

## Notes

These are real-time and domain-typed values, and they stay outside the deterministic core's logical time. The engine's clocks count in their own units, and only comparisons within one clock mean anything (see [DETERMINISM.md](../../docs/DETERMINISM.md)).

`tsconfig.json` sets `types: ["node"]` because the tests use `vitest`, whose types need Node globals and TypeScript 6 does not load `@types/node` by default.

`tsconfig.json` sets `skipLibCheck` because `guardz`'s declarations refer to DOM types such as `FileList`, which a Node-first project does not load. Its own declarations do not mention `guardz`, so packages that import this one are not affected.
