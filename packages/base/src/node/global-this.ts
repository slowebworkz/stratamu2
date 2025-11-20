let cachedGlobal: typeof globalThis | undefined

/**
 * Returns the globalThis object in a Node environment with caching for performance.
 *
 * In modern Node.js, this resolves to `globalThis`.
 * In older Node versions, it falls back to `global`.
 * Caches the result to avoid repeated lookups.
 */
export function getGlobalThis(): typeof globalThis {
  if (cachedGlobal) return cachedGlobal

  if (typeof globalThis !== "undefined") {
    cachedGlobal = globalThis
    return cachedGlobal
  }

  if (typeof global !== "undefined") {
    cachedGlobal = global as typeof globalThis
    return cachedGlobal
  }

  try {
    cachedGlobal = Function("return this")() as typeof globalThis
  } catch {
    // Last resort: throw an error rather than return empty object
    throw new Error("Unable to determine global object in this environment")
  }

  return cachedGlobal
}
