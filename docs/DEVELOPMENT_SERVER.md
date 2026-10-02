# Development Server — Working Plan

This document describes the intended workflow for running `apps/server` during development,
before any investment in production installation, distribution, or deployment tooling.

It is a working plan, not a changelog: items below are checked off only once the corresponding
behavior actually exists in the repository, the same discipline
[Game Engine Architecture](./GAME_ENGINE_ARCHITECTURE.md) uses for its own checklists.

## Where this fits

`apps/server` (`@stratamu/server`) is the application entry point that composes the engine, the
AberMUD adapter, the Telnet plugin, and file-backed persistence into something a Telnet client can
actually connect to and play. That composition already exists (`apps/server/src/main.ts`): it
builds an `Engine`, wires `AberMUDAdapter`'s file-backed account/persona/inventory stores, starts
`@stratamu/plugin-telnet`'s line server, and populates a small hand-built world.

What it does not yet have is a *development workflow* around that composition: a continuously
running engine loop independent of client input, clean shutdown, and simple start/stop/restart
commands wired into both the command line and VS Code. That is the gap this plan addresses.

Docker and production distribution are deliberately out of scope here. The workflow below should
not preclude them later, but it should not be designed around them now.

## Current state vs. target

| Area | Current state | Target |
|---|---|---|
| Runtime loop | Done — `apps/server/src/runtime-driver.ts`'s `createRuntimeDriver` advances a combat `ManualClock` by real monotonic elapsed time (not a fixed per-callback bump, so a late-firing tick catches up rather than falling behind) and pumps the runtime on a fixed interval (`STRATAMU_TICK_MS`, default 1000ms, validated finite and > 0 at startup), independent of client input. Scheduled ticks and client-input `kick()`s share one serialized pump chain, so they never run concurrently; a failed tick is caught, logged, and the driver keeps going | Server-owned driver advances the runtime continuously, independent of client input |
| Combat clock | Done — `main.ts` attaches the combat clock and passes `combatClockId` to `AberMUDAdapter`, so `KILL`'s `scheduleNextRound` now reschedules real rounds instead of staying single-round | AberMUD adapter uses the appropriate combat clock for scheduled rounds |
| Shutdown | Done — `apps/server/src/shutdown.ts`'s `createShutdown` stops accepting connections, stops the runtime driver, writes a notice to and closes every open connection, then waits for them to end, with `drainTimeoutMs` (default 5000ms) bounding the *entire* sequence from the start rather than just that final wait | Graceful shutdown: stop accepting connections, quiesce runtime work, handle active sessions, persist state, close resources, flush logs |
| Start/stop/restart | Done — `pnpm --filter @stratamu/server dev:server` / `dev:server:kill` / `dev:server:restart`, backed by `apps/server/src/dev-server.ts` and `process-tracking.ts`, tracking the started process's pid in `apps/server/.dev-server.pid` | `pnpm dev:server` / `dev:server:kill` / `dev:server:restart`, tracking the process they started |
| Watch mode | None | Restart on relevant source changes, without restarting for unrelated changes, with only one instance running at a time |
| Config/data isolation | `STRATAMU_DATA` / `STRATAMU_PORT` env vars, defaulting to `./data` and `4000` | A development-specific default data directory, predictable dev port, repeatable test-world/account data, and an explicit (not automatic) reset action |
| VS Code integration | `.vscode/` is conventionally untracked in this repo, so nothing here is shared centrally; task definitions for start/stop/restart are documented below for any developer to add locally | Tasks for start/stop/restart/watch that invoke the same scripts as the command line |
| Lifecycle/integration tests | Adapter-level command tests exist; nothing exercises the server process end to end | Lifecycle tests plus an automated Telnet smoke test against a temporary data directory |

## Runtime loop and shutdown

Both are implemented ahead of the development runner described below, which builds on them rather
than the other way around:

- `apps/server/src/runtime-driver.ts`'s `createRuntimeDriver` is a server-owned driver that
  advances the engine's runtime clock on its own schedule, so scheduled work (combat rounds and
  similar) progresses without requiring a client to send input. It lives in `apps/server`, not in
  `@stratamu/plugin-telnet` or `@stratamu/adapter-abermud` — composition stays the application's
  responsibility, per [Game Engine Architecture §9](./GAME_ENGINE_ARCHITECTURE.md#9-adapters--game-profiles)
  and §20's [Apps](./GAME_ENGINE_ARCHITECTURE.md#apps) boundary.
- Elapsed time is measured against an injected monotonic clock, not assumed to be exactly
  `tickMs`: a late-firing tick (event-loop lag, a slow pump, a GC pause) advances the combat clock
  by however many whole `tickMs` units actually elapsed, carrying any fractional remainder into the
  next tick's own measurement rather than losing it.
- Ordinary client input no longer pumps the runtime itself (`LoginFlow` only submits via
  `engine.receive(...)`, in `adapters/abermud/src/login/abermud-login.ts`); it calls the driver's
  `kick()` instead, which runs an extra pump right away — without advancing the combat clock or
  disturbing the regular schedule — so the initial `look` after login and ordinary commands still
  respond promptly instead of waiting out a full tick interval.
- Scheduled ticks and `kick()`s are serialized through one shared pump chain, so the driver never
  runs two `runtime.pump()` calls concurrently; a tick that comes due while a kicked pump is still
  running queues behind it instead. A tick failure (the clock advance or the pump itself
  throwing/rejecting) is caught and logged rather than silently killing the driver, and the elapsed
  time a failed clock-advance attempt measured is preserved for the next tick to retry, not
  discarded.
- `apps/server/src/shutdown.ts`'s `createShutdown` stops accepting new connections, stops the
  driver, notifies and closes every connection still open, and waits for them to end — bounded by a
  single timeout that covers that entire sequence, not just the final wait, so a hung in-flight
  pump can't block shutdown indefinitely. Testable independently of the development runner
  described below, including against a real `LineServer` and real sockets
  (`apps/server/test/shutdown-integration.test.ts`), not only fakes.

## Development-server workflow

### Commands

| Command | Purpose |
|---|---|
| `pnpm --filter @stratamu/server dev:server` | Start the development server as a tracked process. |
| `pnpm --filter @stratamu/server dev:server:kill` | Stop the tracked development server. |
| `pnpm --filter @stratamu/server dev:server:restart` | Stop (if running) and start again. |

Each rebuilds (`tsc -p tsconfig.build.json`) before running, same as the existing `dev` script, so
source changes are always picked up.

### Runner behavior

Implemented in `apps/server/src/dev-server.ts`, built on the small, directly tested
`apps/server/src/process-tracking.ts` (`readPid`/`writePid`/`removePid`/`isAlive`):

- `start` tracks the spawned process's pid in `apps/server/.dev-server.pid` (gitignored), rather
  than killing arbitrary processes by port. It refuses to start a second instance while the PID
  file points at a still-live process, and clears a stale one (pointing at a process that's no
  longer running) with a one-line notice before proceeding.
- The child runs attached to the invoking terminal (`stdio: "inherit"`), not detached, so its
  output stays visible there exactly like the plain `dev` script — `dev:server:kill` and
  `dev:server:restart` are separate invocations (from the same or another terminal) that find it
  via the PID file, not a second owner of its stdio.
- `kill` sends `SIGINT` — the same signal Ctrl+C sends, reusing the server's own existing graceful
  shutdown (`shutdown.ts`) unchanged — and waits up to 8s (longer than `shutdown.ts`'s own 5s
  default `drainTimeoutMs`, so a normal shutdown is never raced) before escalating to `SIGKILL`, so
  it never leaves an orphan behind even if the server hangs.
- `start`'s own exit handler removes the PID file and propagates the child's exit code whenever it
  exits, for any reason — including a startup failure (a port already in use, say) — so "reporting
  startup failures and exit status" falls out of the same cleanup path rather than needing its own
  special case.
- `restart` is `kill` (a no-op if nothing is running) followed by `start`, in one invocation, so
  both the stop confirmation and the fresh server's own logs appear together.

Process management stays entirely in this runner; the server's own graceful shutdown logic in
`main.ts`/`shutdown.ts` is unmodified and unaware of it.

### Watch mode

- Watches `apps/server` and its relevant workspace dependencies, not the whole monorepo.
- Avoids restarting for unrelated file changes.
- Ensures only one server instance runs at a time.
- Keeps persistent development data intact across ordinary restarts.

The simplest tool that integrates with the existing Node.js/pnpm workflow should be preferred over
a bespoke process supervisor.

## Development configuration and data isolation

The development environment must not accidentally modify production data or depend on production
configuration:

- A development-specific configuration, predictable development port, and dedicated development
  data directory (building on the existing `STRATAMU_PORT`/`STRATAMU_DATA` env vars).
- Repeatable test-world and account/persona data, so a fresh checkout has something to log into.
- A documented, explicit way to reset disposable development data — never an automatic consequence
  of restarting the server.
- Clear startup output identifying the configuration and data paths in use (`main.ts` already logs
  the data directory and port; this extends to naming which configuration is active).

## VS Code integration

`.vscode/` is conventionally untracked in this repo (editor configuration is a per-developer
choice, not shared project state), so these tasks can't be committed centrally -- any developer who
wants them adds this to their own `.vscode/tasks.json`, alongside the existing `repo-tools.sh`-backed
tasks:

```jsonc
{
  "label": "Server: Start",
  "detail": "Starts the development server as a managed, tracked process (pnpm dev:server).",
  "type": "shell",
  "command": "pnpm --filter @stratamu/server dev:server",
  "options": { "cwd": "${workspaceFolder}" },
  "presentation": { "reveal": "always", "panel": "dedicated", "close": false },
  "problemMatcher": []
}
```

(and matching `"Server: Stop"` / `"Server: Restart"` entries for `dev:server:kill` /
`dev:server:restart`.) Each is a direct invocation of the same scripts used from the command line,
not a reimplementation of any process-management logic. Unlike the existing quick, silent git tasks
(`reveal: never, close: true`), these use `reveal: always, panel: dedicated, close: false`: the
server is a long-running foreground process whose output needs to stay visible, matching this
plan's own "start the server in a dedicated terminal" and "display logs and startup errors clearly"
goals.

A separate watch-mode task remains pending, tracked below alongside watch mode itself.

## Lifecycle and integration tests

Validate the complete workflow, not only individual engine components:

- **Server lifecycle**: starts successfully, accepts Telnet connections, continues processing
  scheduled work without further client input, stops accepting connections during shutdown,
  persists relevant state, closes resources, and exits cleanly.
- **End-to-end smoke test**, where practical: start the server against a temporary data directory
  and an available port, connect a Telnet client, log in and exercise basic gameplay, connect a
  second client and test multiplayer communication, exercise combat and verify scheduled rounds
  run without further input, shut down, verify persisted state, restart against the same data
  directory, and confirm persisted character state is restored.

Integration tests use temporary data directories so they never touch a developer's normal world.

## Later: Docker and production distribution

Once the local server lifecycle above is reliable, two further areas are investigations, not
implementation commitments:

- **Docker support** — whether a reproducible server image makes sense, whether development and
  production should share an image, supported Node.js versions, how configuration and world data
  should be supplied/mounted, backup/restore, exposed ports, container-signal handling, and image
  versioning against engine releases and persisted data. Persistent data stays outside the
  container's writable layer; no secrets or mutable world data get baked into the image; no
  Docker-specific abstraction belongs in the engine unless a real requirement emerges.
- **Production distribution** — a public CLI for configuration/launch, versioned distribution of
  adapters/plugins/configuration/world assets, supported Node.js versions, production logging and
  data-directory permissions, backup/restore/upgrade procedures, and process supervision (systemd,
  containers, or otherwise). A production CLI and a Docker image are alternative or complementary
  distribution mechanisms; neither is required for ordinary monorepo development.

## Implementation order

| Phase | Work | Priority | Status |
|---|---|---|---|
| 1 | Update README and architecture documentation. | Immediate | Done — this document, plus the README and [Game Engine Architecture](./GAME_ENGINE_ARCHITECTURE.md) updates that link to it |
| 2 | Implement the continuous runtime driver. | Immediate | Done — `apps/server/src/runtime-driver.ts`, unit-tested in `apps/server/test/runtime-driver.test.ts` |
| 3 | Implement graceful server shutdown. | Immediate | Done — `apps/server/src/shutdown.ts`, unit-tested in `apps/server/test/shutdown.test.ts`; required an additive `stopAccepting()` on `@stratamu/plugin-telnet`'s `LineServer` |
| 4 | Add development start, stop, and restart commands. | Next | Done — `apps/server/src/dev-server.ts` and `process-tracking.ts`, both unit-tested (`test/dev-server.test.ts` exercises the lifecycle against real child processes: normal start/stop, restart, SIGKILL escalation, spawn failure, exit-code propagation, the concurrent-start race; `test/process-tracking.test.ts` covers the PID-file/liveness primitives directly) |
| 5 | Add isolated development configuration and data. | Next | Pending |
| 6 | Integrate the commands with VS Code tasks. | Next | Documented, not shared — `.vscode/` is conventionally untracked in this repo, so the task definitions live in the "VS Code integration" section above for any developer to add locally, rather than as committed repo state |
| 7 | Add lifecycle and end-to-end smoke tests. | Next | Pending |
| 8 | Investigate Docker support and deployment requirements. | Later | Pending |
| 9 | Design production CLI and distribution workflows. | Later | Pending |

This document is the project's working plan for the development-server effort; there is no
separate roadmap document to reconcile it against, and one should not be created merely to satisfy
this table.

## Completion criteria

The initial development-server work is complete when a developer can:

- Start the server using one documented command.
- Connect using a Telnet client and exercise supported gameplay.
- Leave the server running while scheduled engine work continues.
- Stop and restart the server without orphaned processes.
- Preserve development data across normal restarts.
- Reset disposable development data explicitly.
- Shut down cleanly and restore persisted state after a restart.
- Run the same workflow from a terminal or VS Code.

**Guiding principle:** establish a reliable local server lifecycle first, and use that proven
lifecycle as the foundation for future containerization and production distribution, without
prematurely building a deployment platform into the engine.
