import { config, guardz } from "@stratamu/eslint/node"

const tslog = {
  group: ["tslog", "tslog/*"],
  message:
    "Only TslogLogger may import tslog. Depend on LoggingCapability from ./types.ts instead.",
}

const emittery = {
  group: ["emittery", "emittery/*"],
  message:
    "Only EmitteryEvents may import emittery. Depend on EventCapability from ./types.ts instead.",
}

const restrict = patterns => ["error", { patterns }]

export default [
  ...config,

  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-imports": restrict([guardz, tslog, emittery]),
    },
  },

  {
    files: ["src/logging/tslog-logger.ts", "src/logging/tslog-logger.test.ts"],
    rules: {
      "no-restricted-imports": restrict([guardz, emittery]),
    },
  },

  {
    files: ["src/events/emittery-events.ts"],
    rules: {
      "no-restricted-imports": restrict([guardz, tslog]),
    },
  },
]
