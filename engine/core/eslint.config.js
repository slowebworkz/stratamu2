import { config, guardz } from "@stratamu/eslint/node"

const restrict = patterns => ["error", { patterns }]

export default [
  ...config,

  {
    // Timeline is the one place that may import mnemonist: it wraps a heap, and everything else
    // uses Timeline's own concept (insert/takeDue/nextDueAt/remove), not the structure itself.
    // guardz stays restricted; engine/core has no business with it at all.
    files: ["src/timeline/timeline.ts"],
    rules: {
      "no-restricted-imports": restrict([guardz]),
    },
  },
]
