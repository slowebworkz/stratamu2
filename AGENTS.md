# stratamu2

## Project Overview

An agnostic Node.js game engine for text-based multiplayer games (MUD, MUSH, MOO, MUCK, etc.).
The engine manages base functions shared by all styles, then exposes adapter interfaces so
different game styles, storage backends, and output protocols can be combined freely.

**Core principle:** Zero game-style, storage, or protocol assumptions in the source libraries.
Dependencies flow in one direction only: packages → adapters → apps.

## Workspace Structure

```
packages/          ← core primitives and config (no style/storage/protocol knowledge)
  base/            ← BaseClass, error system, data structures, utilities
  capabilities/    ← capability types (logging, events) injected into game objects
  events/          ← type-safe event system (SafeEmitter, ListenerRegistry)
  types/           ← shared TypeScript types
  biome-config/    ← shared Biome (lint + format) configuration
  typescript-config/ ← shared tsconfig presets
  vitest-config/   ← shared Vitest configuration

adapters/          ← adapter implementations (@stratamu/adapter-*)
  (none yet — planned by axis:)
  style:    adapter-style-mud, adapter-style-mush, adapter-style-moo, adapter-style-muck
  storage:  adapter-storage-flatfile, adapter-storage-postgres, adapter-storage-sqlite
  protocol: adapter-protocol-ansi, adapter-protocol-pueblo, adapter-protocol-mxp, adapter-protocol-gmcp

apps/              ← runnable game servers (wire engine + chosen adapters)
  (none yet)
```

Future core packages in `packages/`: `@stratamu/world`, `@stratamu/player`,
`@stratamu/commands`, `@stratamu/permissions`.

## Package Scope

All packages use the `@stratamu/` scope.

## Development

```bash
pnpm install          # install all dependencies
pnpm build            # build all packages (respects dependency order via turbo)
pnpm typecheck        # type-check all packages in dependency order
pnpm test             # run all tests
pnpm lint             # lint all packages
pnpm fix              # lint:fix + format all packages
pnpm format           # format all packages
pnpm format:staged    # format only git-staged files (used by pre-commit hook)
```

## Conventions

- **Capability injection** — game objects extend `BaseClass` and receive `log` and `events`
  capabilities via `bindLog()`/`bindEvents()`. Never inherit the emitter directly.
- **One-way dependencies** — `packages/` never imports from `adapters/` or `apps/`;
  `adapters/` never imports from `apps/`.
- **`catalog:`** — all shared dependency versions are pinned in `pnpm-workspace.yaml`.
  Use `catalog:` in `package.json` files; never duplicate a version string.
- **No DOM** — Node.js runtime only. `tsconfig/base.json` targets ES2024, no DOM libs.
