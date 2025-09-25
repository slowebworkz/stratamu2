import { performance } from 'node:perf_hooks'

/**
 * High-precision timer wrapper:
 * - globalThis.performance.now() (browser-like envs in Node 19+)
 * - node:perf_hooks.performance.now()
 * - Date.now() as a last fallback
 */
export const perfNow: () => number =
  typeof globalThis.performance?.now === 'function'
    ? () => globalThis.performance.now()
    : typeof performance?.now === 'function'
      ? () => performance.now()
      : () => Date.now()
