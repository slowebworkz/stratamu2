import globals from "globals"

import { config as base } from "./base.js"

export { guardz } from "./base.js"

/** @type {import("eslint").Linter.Config[]} */
export const config = [
  ...base,

  {
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
  },
]
