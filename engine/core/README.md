# @stratamu/engine-core

The core engine's **execution substrate**: tasks, clocks, timelines, queues and the mechanics of running work. It provides mechanisms and imposes no game semantics. An adapter supplies the execution policy that decides how they are used. See section 16 of [the architecture](../../docs/GAME_ENGINE_ARCHITECTURE.md).

**Status:** prototype. Private and unpublished.

## What exists

- `Runtime`: submit tasks (`submit`), run them inline (`context.run`), take steps (`step`, `drain`), cancel by handle, lane or tag.
- Tasks as data (`type`, `payload`, `lane`, `tags`) executed by handlers registered by type.
- Named clocks, attached as instances (see [`@stratamu/clock`](../../libs/clock)).
- Triggers: `now`, `after`, `at`.
- Task states: scheduled, ready, running, completed, failed, cancelled.
- `ExecutionPolicy`: the seam that chooses which ready task runs next and whether inline execution is allowed. `oldestReady` is the default policy.

Source folders each hold one concept, with an `index.ts` barrel: `clock`, `lane`, `policy`, `runtime`, `task`, `timeline`, `trigger`.

## Not yet

- Waiting and waking, recurring work, phases and boundaries, priority, fairness and budgets (the work model in section 16).
- A persistent task model. `Task` is plain data and a runtime-only `TaskExecution` is kept apart from it, but nothing is stored yet.
- The engine lifecycle, and the wall-clock driver that feeds clocks. Both belong to the environment side and have no workspace yet.
- World, rules, sessions and persistence.

## Determinism

The runtime reads time only from injected clocks and never reads wall time or randomness. See [DETERMINISM.md](../../docs/DETERMINISM.md).

## Depends on

`@stratamu/base` (logging), `@stratamu/clock`, and `@stratamu/capabilities`. The last two `packages/` dependencies are part of the transition described in the architecture document.
