import eslint from "@eslint/js"
import turbo from "eslint-plugin-turbo"
import tseslint from "typescript-eslint"

/**
 * `guardz` is an implementation dependency of `@stratamu/guards`, not part of Stratamu's own
 * vocabulary. Packages import the guards from `@stratamu/guards`.
 */
export const guardz = {
  group: ["guardz", "guardz/*"],
  message:
    "guardz is an implementation detail of @stratamu/guards. Import type guards from @stratamu/guards instead.",
}

/**
 * `mnemonist` is for internal implementation only: a data structure package uses it to build its
 * own concept (`Timeline` uses a heap, say), and exposes that concept, not the structure. This
 * keeps the dependency replaceable and keeps `Heap`/`Deque`/`LRUCache` out of the architecture's
 * own vocabulary, the same way `guardz` is kept out of it.
 */
export const mnemonist = {
  group: ["mnemonist", "mnemonist/*"],
  message:
    "mnemonist is for internal implementation only. Expose the concept it backs (such as Timeline), not the structure itself.",
}

/** @type {import("eslint").Linter.Config[]} */
export const config = [
  {
    ignores: [
      "**/dist/**",
      "**/lib/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/.output/**",
      "**/.cache/**",
    ],
  },

  eslint.configs.recommended,

  ...tseslint.configs.recommended,

  {
    plugins: {
      turbo,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "error",
    },
  },

  {
    rules: {
      "no-restricted-imports": ["error", { patterns: [guardz, mnemonist] }],
    },
  },
]
