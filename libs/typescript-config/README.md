# @stratamu/typescript-config

Shared TypeScript presets. Workspaces extend a preset instead of keeping their own compiler settings.

**Status:** in use by every TypeScript workspace.

## Presets

- `esm-ts`: emitting ESM for Node with NodeNext. Source imports use `.ts` extensions and `rewriteRelativeImportExtensions` rewrites them to `.js` on emit. This is what the packages use.
- `esm`: emitting ESM with real `.js` extensions.
- `base`: the strict base the others extend.
- `no-emit`, `types-only`, `vitest`: variants of `base` for projects that do not emit. `decorators` extends `no-emit`.

`fixtures/` holds a small project per preset, and `pnpm typecheck` compiles each one so a preset that stops working is caught here.

## Notes

TypeScript is pinned to 6.x. TypeScript 6 does not load `@types/node` by default, so a workspace that uses Node globals sets `types: ["node"]` itself.
