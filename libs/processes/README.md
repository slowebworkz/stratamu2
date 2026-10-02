# @stratamu/processes

Execution outside the authoritative game runtime: worker threads and child processes. Infrastructure, not game logic -- it knows nothing about rooms, players, or commands.

**Status:** Phase 1-2 of [`docs/PROCESSES_LIBRARY.md`](../../docs/PROCESSES_LIBRARY.md): child-process management. Worker threads, the JSON-Lines child-process protocol, a cross-language fixture, and plugin capability wiring are not yet implemented.

## What this is

A `ChildProcessManager` creates and tracks `ManagedProcess` instances: one spawned OS process each, with lifecycle state, exit status, bounded stdout/stderr capture, and graceful-then-forced termination (`SIGTERM`, then `SIGKILL` if the grace period elapses). Cancellation (`AbortSignal`) and timeouts use the same graceful escalation as an explicit `stop()`, so a process the library itself decided to end still gets a chance to clean up.

`run()` and `start()` are two front doors onto the same `ManagedProcess` lifecycle engine -- `run` awaits it to completion and resolves with a `ProcessResult`; `start` hands back the live handle immediately.

Never shells out: a `ProcessDefinition`'s executable and arguments are always passed as an explicit array (`shell: false`), never a constructed command string.

## What this isn't

- Not a worker-thread pool (Phase 3).
- Not a cross-language protocol (JSON-Lines over stdio, Phase 4) -- `ManagedProcess.write()` is a raw stdin write today, not a structured message.
- Not integrated with `apps/server`'s shutdown sequence yet (Phase 5).
- Not exposed to plugins or game code yet (Phase 5+); a `ProcessDefinition` is constructed directly in trusted code, not looked up from a name-based registry a less-trusted caller could influence.
- Does not depend on `@stratamu/task`/`@stratamu/work`: those describe the engine's own in-process, admitted-and-sequenced work model. This package is a different layer -- OS-level child-process lifecycle, with no admission order or in-process routing. A future integration can bridge the two without this package knowing either exists.

## What exists

| Export | What it does |
|---|---|
| `ProcessDefinition` | What to launch: executable, args, cwd, env. Constructed in code, never from a raw string. |
| `ChildProcessManager` | Creates and tracks `ManagedProcess` instances: `start`, `run`, `get`, `stop`, `stopAll`, and an `events` bus (`process.started`/`stdout`/`stderr`/`exited`/`failed`/`stopped`/`killed`). |
| `ManagedProcess` | One spawned process: `state`, `pid`, `exitCode`, `signal`, `settled`, `write()`, `stop()`, `kill()`. |
| `ProcessResult` | The terminal outcome: `"completed"` (any exit code), `"failed"` (never successfully started), `"cancelled"`, or `"timed-out"` -- never thrown for an expected alternate outcome, the same convention `engine/core/src/runtime/runtime.ts`'s `TaskOutcome` uses. |
| `ExecutionOptions` | `signal`, `timeoutMs`, `stopTimeoutMs` -- shared vocabulary this package and the future worker pool both use. |

```ts
const manager = new ChildProcessManager()
const result = await manager.run({ id: "echo", executable: "node", args: ["-e", "console.log('hi')"] })
result.state // "completed"
result.stdout // "hi\n"
```

## Not yet

- Worker-thread pool (`workers/`), added when Phase 3 starts -- no placeholder directory exists for it yet.
- The JSON-Lines child-process protocol and a cross-language test fixture (Phase 4).
- Server shutdown integration (Phase 5).
- A name-based process-definition registry/allowlist for less-trusted callers (Phase 5+, `docs/PROCESSES_LIBRARY.md` §15).
- Concurrency/queue limits on how many child processes run at once (that is the worker pool's job, not this package's, per the current scope).
