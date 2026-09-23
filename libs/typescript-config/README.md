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

- **guardz:** its declarations refer to DOM types such as `FileList`, which a Node-first project does not load. `primitives` needs it. Its own declarations do not mention `guardz`, so packages that import it do not.
- **eslint-plugin-turbo:** `eslint-config` type-checks its JavaScript and needs it for this plugin's declarations.

`skipLibCheck` hides errors in every declaration file, including this workspace's own, so do not add it to a package that compiles without it. Remove it from a package when the cause goes away -- `engine/core`, `capabilities` and `base` carried it for a `pino`/`thread-stream` incompatibility with `@types/node` 26 until `capabilities` moved to `tslog` (zero runtime dependencies) instead.

`fixtures/` holds a small project per preset, and `pnpm typecheck` compiles each one so a preset that stops working is caught here.

## Notes

TypeScript is pinned to 6.x. TypeScript 6 does not load `@types/node` by default, so a workspace that uses Node globals sets `types: ["node"]` itself.

`base`'s `lib` includes `ESNext.Disposable` alongside `ES2022`: the `Symbol.dispose`/`Symbol.asyncDispose` globals behind `using`/`await using`, needed once `capabilities` started depending on `tslog` (whose `Logger` implements both disposers). A narrow, precise addition -- not the rest of `ESNext` -- and available to every workspace, not scoped to `capabilities` alone, since any future dependency using resource management would need the same thing.
