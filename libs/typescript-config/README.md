# @stratamu/typescript-config

Shared TypeScript presets. Workspaces extend a preset instead of keeping their own compiler settings.

**Status:** in use by every TypeScript workspace.

## Presets

- `esm-ts`: emitting ESM for Node with NodeNext. Source imports use `.ts` extensions and `rewriteRelativeImportExtensions` rewrites them to `.js` on emit. This is what the packages use.
- `esm`: emitting ESM with real `.js` extensions.
- `base`: the strict base the others extend.
- `no-emit`, `types-only`, `vitest`: variants of `base` for projects that do not emit. `decorators` extends `no-emit`.
- `skip-lib-check`: sets `skipLibCheck`. It is not a base. A package adds it to the list it extends: `"extends": ["@stratamu/typescript-config/esm-ts", "@stratamu/typescript-config/skip-lib-check"]`.

### When to use `skip-lib-check`

Only when a dependency's own declaration files do not compile in this project. `base` turns `skipLibCheck` off on purpose. The current reasons:

- **pino:** `thread-stream`'s types use `worker_threads.TransferListItem`, which `@types/node` 26 does not have. `capabilities` and `base` need it, and so does `engine/core`, because their declarations expose pino's types.
- **guardz:** its declarations refer to DOM types such as `FileList`, which a Node-first project does not load. `primitives` needs it. Its own declarations do not mention `guardz`, so packages that import it do not.
- **eslint-plugin-turbo:** `eslint-config` type-checks its JavaScript and needs it for this plugin's declarations.

`skipLibCheck` hides errors in every declaration file, including this workspace's own, so do not add it to a package that compiles without it. Remove it from a package when the cause goes away, for example when `@types/node` moves to a version pino's types accept.

`fixtures/` holds a small project per preset, and `pnpm typecheck` compiles each one so a preset that stops working is caught here.

## Notes

TypeScript is pinned to 6.x. TypeScript 6 does not load `@types/node` by default, so a workspace that uses Node globals sets `types: ["node"]` itself.
