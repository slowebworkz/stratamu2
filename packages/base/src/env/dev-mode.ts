// env/dev-mode.ts

/**
 * A safe, environment-agnostic DEV mode detector.
 * Works in Node, browser, workers, bun, vite, webpack, etc.
 * Fully tree-shakable.
 */
export const DEV_MODE: boolean = (() => {
  // --- Node / Bun / SSR environments ---
  if (typeof process !== "undefined" && process?.env?.NODE_ENV) {
    return process.env.NODE_ENV !== "production"
  }

  // --- Bundlers may define __DEV__ (Vite, esbuild, Metro, Rollup) ---
  try {
    // @ts-ignore - bundlers may inject this constant
    if (typeof __DEV__ !== "undefined") {
      // @ts-ignore
      return Boolean(__DEV__)
    }
  } catch {
    /* ignore */
  }

  // --- Browser fallback ---
  // If a global variable is intentionally set in HTML or bootstrap
  try {
    // @ts-ignore - user may set window.__DEV__ manually
    if (typeof globalThis.__DEV__ !== "undefined") {
      // @ts-ignore
      return Boolean(globalThis.__DEV__)
    }
  } catch {
    /* ignore */
  }

  // --- Default: assume production for safety ---
  return false
})()
