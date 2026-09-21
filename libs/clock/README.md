# @stratamu/clock

Clocks: the sources of time values. The engine receives clock instances from here rather than keeping time itself.

**Status:** working and tested. Private and unpublished. Depends on [`@stratamu/primitives`](../primitives) for the values it produces.

## The layering

- `@stratamu/primitives` defines temporal **values**: `Duration`, `Instant`, `Timestamp`.
- `@stratamu/clock` **acquires** them: a clock is where a reading comes from.
- The engine **uses** clocks to run time-dependent behaviour.

## Roles

- **`Clock<T>` supplies readings.** It says what kind of reading a clock produces, not what kind of clock it is: `now(): T`.
- **`ManualClock` is the logical and test clock.** It moves only when told to, so logical time (pulses, rounds, turns) and tests are deterministic.
- **`MonotonicClock` is the host scheduling-time source.** It reports real elapsed time from the host, never moves backwards, and is what work is scheduled against in real time.
- **`WallClock` is for wall timestamps and is not a scheduling clock.** It reports Unix time for logging, persistence and display, and it can move backwards when the system time is adjusted.

## What exists

| Clock | Reading | Notes |
|-------|---------|-------|
| `ManualClock<TDomain>` | `Instant<TDomain>` | Moves only when advanced, and only forward. Deterministic, so it can be scheduled on. Use it for pulses, rounds, turns and tests. |
| `MonotonicClock` | `Instant<MonotonicTime>` | Whole milliseconds from the platform's monotonic timer. Never moves backwards. Can be scheduled on. Belongs to the runtime environment, so it is not replayable. |
| `WallClock` | `Timestamp` | Unix time in milliseconds. For timestamps. It can move backwards when the system time is adjusted, so it is not for scheduling. |

```ts
const clock = new ManualClock(Instant.from<Pulse>(0n))
clock.advance(Duration.from<Pulse>(10n))
clock.now().value // 10n
```

- `ManualClock` has no `set()`, and `advance` refuses a negative duration, so it cannot move backwards.
- `MonotonicClock` floors `performance.now()`, which makes 1 ms its resolution. That is deliberate: a scheduling clock does not need more, and the reading stays a whole number that is exact as a JavaScript number.
- Domains are checked: a `ManualClock<Pulse>` cannot be advanced by a `Duration<Wall>`, and a `Clock<Instant<Pulse>>` is not a `Clock<Instant<Wall>>`. The tests guard this with `@ts-expect-error`.

## Not yet

- A pulse driver that turns wall time into `ManualClock` advances, with a catch-up policy. That is environment-side code and has no home yet.

## Notes

`tsconfig.json` sets `types: ["node"]` because `MonotonicClock` imports from `node:perf_hooks`, and the tests use `vitest`, whose types need Node globals. TypeScript 6 does not load `@types/node` by default.
