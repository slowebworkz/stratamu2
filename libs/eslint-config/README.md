# @stratamu/eslint

Shared ESLint flat configuration (ESLint 10).

**Status:** in use by every TypeScript workspace.

## Exports

- `@stratamu/eslint/base`: the base config.
- `@stratamu/eslint/node`: the base plus Node's built-in globals. Workspaces re-export it from their `eslint.config.js`.

Formatting is handled by Biome, not ESLint. The `pnpm check` gate runs `biome format` and ESLint. Biome's own lint rules and import sorting (`biome check`) are not part of that gate, so run `pnpm biome check` too.
