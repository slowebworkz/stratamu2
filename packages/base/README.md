# @repo/base

## Utility-Only Source Package

This package provides common utility functions, helpers, and types for use across the monorepo. It is **not** a core part of the game engine and contains no engine-specific logic.

- No build step or dist/ output: all code is consumed as TypeScript source.
- No main/types/exports fields in package.json.
- All consumers should import directly from the source (e.g., `@repo/base/data`, `@repo/base/utils`).
- All code is ESM and TypeScript-first; no CommonJS or JS-only support.

### Migration Notes
- If you previously relied on built .js/.d.ts files, update your imports to use TypeScript source paths.
- Do not treat @repo/base as a core dependency—use only the utilities you need.

---

For more details, see the monorepo migration guide.
