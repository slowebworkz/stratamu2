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
| Runtime loop | `engine.runtime.pump(100)` runs only in response to a logged-in connection's first `look` | Server-owned driver advances the runtime continuously, independent of client input |
| Combat clock | Not yet configured | AberMUD adapter uses the appropriate combat clock for scheduled rounds |
| Shutdown | `SIGINT`/`SIGTERM` close the Telnet server and exit; no draining of in-flight work or explicit persistence flush | Graceful shutdown: stop accepting connections, quiesce runtime work, handle active sessions, persist state, close resources, flush logs |
| Start/stop/restart | `pnpm --filter @stratamu/server dev` builds and runs in the foreground; no managed restart | `pnpm dev:server` / `dev:server:kill` / `dev:server:restart`, tracking the process they started |
| Watch mode | None | Restart on relevant source changes, without restarting for unrelated changes, with only one instance running at a time |
| Config/data isolation | `STRATAMU_DATA` / `STRATAMU_PORT` env vars, defaulting to `./data` and `4000` | A development-specific default data directory, predictable dev port, repeatable test-world/account data, and an explicit (not automatic) reset action |
| VS Code integration | `.vscode/tasks.json` covers git/repo-tools workflow only | Tasks for start/stop/restart/watch that invoke the same scripts as the command line |
| Lifecycle/integration tests | Adapter-level command tests exist; nothing exercises the server process end to end | Lifecycle tests plus an automated Telnet smoke test against a temporary data directory |

## Runtime loop and shutdown

Before building a development runner on top of it, the server process itself needs to be able to
run continuously and stop cleanly:

- A server-owned driver advances the engine's runtime clock on its own schedule, so scheduled work
  (combat rounds and similar) progresses without requiring a client to send input.
- The AberMUD adapter selects its combat clock explicitly, rather than relying on an incidental
  `pump` call from the login flow.
- The runtime driver lives in `apps/server`, not in `@stratamu/plugin-telnet` or
  `@stratamu/adapter-abermud` — composition stays the application's responsibility, per
  [Game Engine Architecture §9](./GAME_ENGINE_ARCHITECTURE.md#9-adapters--game-profiles) and
  §20's [Apps](./GAME_ENGINE_ARCHITECTURE.md#apps) boundary.
- Shutdown stops accepting new connections, quiesces new runtime work, handles active sessions and
  in-flight operations, persists player/world state, closes network connections and other
  resources, and flushes logging before exit — testable independently of the development runner
  described below.

## Development-server workflow

### Proposed commands

| Command | Purpose |
|---|---|
| `pnpm dev:server` | Start the development server. |
| `pnpm dev:server:kill` | Stop the development server. |
| `pnpm dev:server:restart` | Restart the development server. |

These names are proposals, to be reconciled with `apps/server`'s existing `dev`/`start` scripts
before implementation — not a commitment to a specific script name.

### Runner behavior

- Starts the server as a managed process and tracks the process it started, rather than killing
  arbitrary processes by port.
- Supports predictable stop and restart behavior, reporting startup failures and exit status.
- Keeps server output visible in a dedicated terminal.
- Avoids leaving orphaned processes after a restart or failed startup.

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

Add tasks alongside the existing `repo-tools.sh`-backed tasks in `.vscode/tasks.json`:

- Start the server in a dedicated terminal.
- Stop the managed server process.
- Restart the server.
- Optionally, a separate watch-mode task.
- Display logs and startup errors clearly.

Tasks should invoke the same underlying scripts used from the command line, not duplicate
process-management logic.

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

| Phase | Work | Priority |
|---|---|---|
| 1 | Update README, roadmap, and architecture documentation. | Immediate |
| 2 | Implement the continuous runtime driver. | Immediate |
| 3 | Implement graceful server shutdown. | Immediate |
| 4 | Add development start, stop, and restart commands. | Next |
| 5 | Add isolated development configuration and data. | Next |
| 6 | Integrate the commands with VS Code tasks. | Next |
| 7 | Add lifecycle and end-to-end smoke tests. | Next |
| 8 | Investigate Docker support and deployment requirements. | Later |
| 9 | Design production CLI and distribution workflows. | Later |

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
