import { config } from "@stratamu/eslint/node"

const pino = {
  group: ["pino", "pino/*"],
  message: "Only PinoLogger may import pino. Depend on LoggingCapability from ./types.ts instead.",
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
      "no-restricted-imports": restrict([pino, emittery]),
    },
  },

  {
    files: ["src/logging/pino-logger.ts", "src/logging/pino-logger.test.ts"],
    rules: {
      "no-restricted-imports": restrict([emittery]),
    },
  },

  {
    files: ["src/events/emittery-events.ts"],
    rules: {
      "no-restricted-imports": restrict([pino]),
    },
  },
]
