# @stratamu/eslint

Shared ESLint flat configuration (ESLint 10).

**Status:** in use by every TypeScript workspace.

## Exports

- `@stratamu/eslint/base`: the base config.
- `@stratamu/eslint/node`: the base plus Node's built-in globals. Workspaces re-export it from their `eslint.config.js`.

The base config restricts importing `guardz`, an implementation dependency of `@stratamu/primitives`, so packages use the guards `primitives` exports instead. `@stratamu/eslint/node` exports the restriction as `guardz`. A package that replaces `no-restricted-imports` with its own list must include it, as `capabilities` does. `libs/primitives` turns the rule off, because it wraps `guardz`.

Formatting is handled by Biome, not ESLint. The `pnpm check` gate runs `biome format` and ESLint. Biome's own lint rules and import sorting (`biome check`) are not part of that gate, so run `pnpm biome check` too.
