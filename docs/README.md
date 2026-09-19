# stratamu2 Migration Docs

Steps to align this repo with the patterns established in `sew-professional`.

## Steps

| # | Document | Summary |
|---|----------|---------|
| 1 | [pnpm Catalog & Version](./01-pnpm-catalog.md) | Pin all shared deps in `pnpm-workspace.yaml`, upgrade pnpm |
| 2 | [Turbo Pipeline](./02-turbo-pipeline.md) | Add `typecheck`, `dev`, `format`, `fix` tasks; add `format:staged` |
| 3 | [apps/ + packages/ Structure](./03-workspace-structure.md) | What belongs in `apps/` vs `packages/`, naming conventions |
| 4 | [Config Package Patterns](./04-config-packages.md) | How sew-pro structures `typescript-config`, `prettier-config`, `eslint-config` and what to adapt |

## Reference

- [sew-professional](../../sew-professional) — the reference repo
- [turbo.json](../turbo.json)
- [pnpm-workspace.yaml](../pnpm-workspace.yaml)
