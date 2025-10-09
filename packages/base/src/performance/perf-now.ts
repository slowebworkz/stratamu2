import { performance } from 'node:perf_hooks'
import { getGlobalThis } from '../node/index.js'

// Obtain a runtime-safe reference to the global object so we don't rely on the
// presence of the global `globalThis` identifier at parse-time in all targets.
const g = getGlobalThis()

/**
 * High-precision timer wrapper:
 * - globalThis.performance.now() (browser-like envs in Node 19+)
 * - node:perf_hooks.performance.now()
 * - Date.now() as a last fallback
 */
export const perfNow: () => number =
  typeof g.performance?.now === 'function'
    ? () => g.performance.now()
    : typeof performance?.now === 'function'
      ? () => performance.now()
      : () => Date.now()
