# Documentation

| Document | Summary |
|----------|---------|
| [Game Engine Architecture](./GAME_ENGINE_ARCHITECTURE.md) | The working design: engine responsibilities, adapters, plugins, libs, the execution substrate and work model |
| [Determinism](./DETERMINISM.md) | What the logical engine guarantees, its inputs, and what counts as environmental |
| [Session Boundary](./SESSION_BOUNDARY.md) | Investigation/design: the identity model, input flow and open questions for the boundary between external participants and the engine |
| [Development Server](./DEVELOPMENT_SERVER.md) | Working plan: running `apps/server` locally — runtime loop, graceful shutdown, start/stop/restart commands, config/data isolation, VS Code tasks, and lifecycle tests |
| [`@stratamu/processes`](./PROCESSES_LIBRARY.md) | Proposal: a worker-thread/child-process execution library for work outside the authoritative game runtime — not yet implemented |

The architecture is a working design and changes as implementation tests it.
