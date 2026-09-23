# @stratamu/capabilities

Capability contracts and their default adapters: logging and events. A contract is a small interface in `types.ts` with no third-party types. An adapter implements it and is the only place a third-party library is imported.

**Status:** working and tested. Private and unpublished. Whether the concrete `tslog`/`emittery` adapters should eventually split out into their own `plugins/` packages, leaving only the contracts here, is still open; nothing currently needs that split (see the architecture document).

## What exists

- **Logging**: `LoggingCapability`, `TslogLogger`, and a process-wide root logger (`setRootLogger`, `createContextLogger`). `password`, `token`, `secret` and `authorization` are redacted by default, at any depth.
- **Events**: `EventCapability` and `EmitteryEvents`, with `on`, `once`, `off` and `emit`, `AbortSignal` support, and a documented lifecycle for `once()`. Event maps must be type aliases, not interfaces.

ESLint guards keep `tslog` and `emittery` inside their adapter files.

## Logging semantics

`LoggingCapability` (`types.ts`) states its own semantics, decided on Stratamu's own terms rather than inherited from whichever library implements it:

- A logger's **bindings win over a call's own fields** on a name collision: a binding identifies *who* is logging, not *what* is being logged about, and that identity should not be spoofable by log content.
- **An `Error` is never silently lost**, wherever it appears in what was logged -- alone, or as a field inside a larger structured payload -- and is always serialized to at least `{ name, message, stack }`.
- Structured context data **passes through as given**: the point of a context object is queryable fields, not just a message string.
- Sensitive fields are **redacted at any depth**, not only at the top level.

`tslog` satisfies most of this natively (levels, child loggers, structured JSON, key-based redaction at any depth) with zero runtime dependencies. Its own defaults differ from the first two points above -- a call's field beats a same-named binding, and an `Error` nested inside a fields object is silently dropped rather than serialized -- so `TslogLogger` enforces both itself, on top of tslog's primitives. Neither is a defect in tslog; they were simply never the semantics this contract chose. See `tslog-logger.ts`'s `#protectBindings` and `normalizeErrors`.

## Not yet

- Multiple engines in one process: the root logger is shared process-wide.
- Later logging phases (command, audit and transcript logging).

## Notes

`capabilities` moved its logging adapter from `pino` to `tslog`. The immediate trigger was a `pino`/`thread-stream` declaration (`worker_threads.TransferListItem`) `@types/node` 26 removed, with no version of either that avoided it -- but the deeper reason was reconsidering the capability itself: `pino`'s worker-thread/transport machinery, the actual reason to prefer it, was never configured or used here, so nothing about this package's actual logging needs required carrying it. `engine/core`, `capabilities` and `base` no longer need `skipLibCheck` because of it -- see `@stratamu/typescript-config`'s README.
