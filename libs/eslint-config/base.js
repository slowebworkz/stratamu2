import eslint from "@eslint/js"
import turbo from "eslint-plugin-turbo"
import tseslint from "typescript-eslint"

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
]
