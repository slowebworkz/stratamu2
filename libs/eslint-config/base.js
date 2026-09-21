import eslint from "@eslint/js"
import turbo from "eslint-plugin-turbo"
import tseslint from "typescript-eslint"

/**
 * `guardz` is an implementation dependency of `@stratamu/primitives`, not part of Stratamu's own
 * vocabulary. Packages import the guards from `@stratamu/primitives`.
 */
export const guardz = {
  group: ["guardz", "guardz/*"],
  message:
    "guardz is an implementation detail of @stratamu/primitives. Import its guards, such as isTaskId, from @stratamu/primitives instead.",
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
      "no-restricted-imports": ["error", { patterns: [guardz] }],
    },
  },
]
