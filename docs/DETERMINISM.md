# Determinism

The engine guarantees deterministic ordering and state transitions for a given logical input history and execution policy. Environmental timing and external I/O are nondeterministic inputs to that model.

This is a property of the logical engine, not of the whole runtime environment.

## What defines an execution

The same values produce the same execution. Together they are the engine's deterministic inputs:

| Input | Meaning |
|-------|---------|
| External input | Player commands, system actions and other events, in the order the engine accepted them |
| Logical time | The readings of the engine's clocks, whether pulses, rounds or milliseconds |
| Execution policy | The scheduler policy and its configuration, including budgets and clock precedence |
| RNG state | The state of the random source the engine uses, which is seeded and injected |
| Adapter configuration | The game profile: rules, defaults and enabled capabilities |

## What is environmental

These are nondeterministic, and outside the guarantee:

- network timing and arrival order
- operating-system scheduling
- the wall clock
- external services, including storage latency and failures

They affect the engine only by becoming inputs above: a timer tick becomes an advance of a logical clock, and a message becomes accepted external input. Once they have crossed that boundary and been recorded, they are part of the input history.

## Rules inside the boundary

- Read time only from injected clocks. Never call `Date.now()`, `performance.now()` or similar.
- Never call `Math.random()`. Use the injected random source.
- Identify tasks and events with counters, not random or time-based ids.
- Run one step at a time, and do not let ordering depend on how quickly asynchronous work happens to finish.
- Keep execution policies deterministic: the same configuration and the same view of ready work must give the same choice. A policy may hold state but must not read the environment.
- Handlers are part of the logical engine. A handler that reads the wall clock or randomness breaks the guarantee for the games that use it.

## Where the boundary is enforced

- `libs/clock` separates a manual clock, which moves only when told to, from the monotonic and wall clocks, which belong to the environment. `libs/primitives` defines the time values and never reads a clock.
- `engine/core`'s `Runtime` reads time only through injected clocks. Its tests check that it never reads wall time or randomness and that the same inputs give the same order.
- The runtime does not order tasks from different clocks, because their units cannot be compared. An execution policy establishes any such order explicitly, so it is part of the input.

## Not yet built

- The random source and its state.
- Recording the input history, and replaying it.
- Adapter configuration as an explicit, versioned input.
