# @stratamu/primitives

Small value types shared across the workspaces. It has no runtime dependencies.

**Status:** working and tested. Private and unpublished. No other workspace depends on it yet.

## What exists

All three live in `src/time` and are exported from the package entry.

- `Duration<TDomain>`: an amount of time in a temporal domain. `from`, `zero`, `add`, `subtract`.
- `Instant<TDomain>`: a point in a temporal domain. `from`, `zero`, `add` and `subtract` a `Duration` of the same domain, and `durationSince`.
- `Timestamp`: a wall-clock time in milliseconds since the Unix epoch. Its meaning is fixed, so it has no domain. `fromMilliseconds`, `fromNumber`, `fromDate`, `add` and `subtract` (in milliseconds), `toDate`, `toISOString`, `toJSON`.

All three hold a `bigint`, so values stay exact beyond the safe integer range. They share `compare`, `equals`, `isBefore`, `isAfter` and `toString` through an internal base class, `TemporalValue`, which is not exported.

### Domains

A domain says what the units mean: `Duration<Pulse>`, `Duration<WallTime>` and `Instant<GameTime>` are different, and mixing them is a compile error. That includes comparing them, adding them, widening `Duration<"pulse">` to `Duration<string>`, and using an `Instant` where a `Duration` is expected.

This relies on a phantom field, `declare private readonly __domain: (value: TDomain) => TDomain`, which makes the domain parameter invariant. Do not replace it with a simpler brand such as `readonly __brand: TDomain`: that still separates unrelated domains but allows widening. The `@ts-expect-error` tests in `duration.test.ts` and `instant.test.ts` guard this, and `pnpm typecheck` fails if the rule stops holding.

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
- The engine's `Clock` still reports plain numbers. Nothing connects clocks to `Instant` yet.

## Notes

These are real-time and domain-typed values, and they stay outside the deterministic core's logical time. The engine's clocks count in their own units, and only comparisons within one clock mean anything (see [DETERMINISM.md](../../docs/DETERMINISM.md)).

`tsconfig.json` sets `types: ["node"]` because the tests use `vitest`, whose types need Node globals and TypeScript 6 does not load `@types/node` by default.
