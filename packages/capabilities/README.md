# @stratamu/capabilities

Capability contracts and their default adapters: logging and events. A contract is a small interface in `types.ts` with no third-party types. An adapter implements it and is the only place a third-party library is imported.

**Status:** working and tested. Private and unpublished. It lives in `packages/`, which is part of the repository's transition state; the adapters are candidates for `plugins/` and the contracts for `libs/`, but that is undecided.

## What exists

- **Logging**: `LoggingCapability`, `PinoLogger`, and a process-wide root logger (`setRootLogger`, `createContextLogger`). Bindings on a logger cannot be overridden by fields in a log call. `password`, `token`, `secret` and `authorization` are redacted by default.
- **Events**: `EventCapability` and `EmitteryEvents`, with `on`, `once`, `off` and `emit`, `AbortSignal` support, and a documented lifecycle for `once()`. Event maps must be type aliases, not interfaces.

ESLint guards keep `pino` and `emittery` inside their adapter files.

## Not yet

- Multiple engines in one process: the root logger is shared process-wide.
- Later logging phases (command, audit and transcript logging).

## Notes

`skipLibCheck` is on because pino's `thread-stream` types do not compile against `@types/node` 26.
