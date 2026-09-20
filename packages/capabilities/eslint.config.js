import { config } from "@repo/eslint/node"

export default [
  ...config,

  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["pino", "pino/*"],
              message:
                "Only PinoLogger may import pino. Depend on LoggingCapability from ./types.js instead.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["src/logging/pino-logger.ts", "src/logging/pino-logger.test.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]
