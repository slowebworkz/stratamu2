# @stratamu/clock

Basic clock definitions. The engine receives clock instances from here rather than keeping time itself.

**Status:** small and stable in shape. Private and unpublished.

## What exists

- `Clock`: `now()`, a number in the clock's own units. Only comparisons within one clock mean anything.
- `ManualClock`: moves only when advanced. Use it for pulses, rounds, turns and tests. It is deterministic.
- `MonotonicClock`: milliseconds from the platform's monotonic timer. It advances on its own, so it belongs to the runtime environment and not to logic that must be replayable.

## Not yet

- A pulse driver that turns wall time into `ManualClock` advances, with a catch-up policy. That is environment-side code and has no home yet.

## Notes

`tsconfig.json` sets `types: ["node"]` because `MonotonicClock` uses the `performance` global and TypeScript 6 does not load `@types/node` by default.
