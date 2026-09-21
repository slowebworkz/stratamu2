import { config } from "@stratamu/eslint/node"

export default [
  ...config,

  {
    // The one package that may import guardz: it wraps it, and everyone else uses the wrappers.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]
