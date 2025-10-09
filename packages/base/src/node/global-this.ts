/**
 * Returns the globalThis object in a Node environment.
 *
 * In modern Node.js, this resolves to `globalThis`.
 * In older Node versions, it falls back to `global`.
 */
export function getGlobalThis(): typeof globalThis {
  // Prefer the standardized globalThis if available
  if (typeof globalThis !== 'undefined') {
    return globalThis
  }

  // Fallback for very old Node versions
  if (typeof global !== 'undefined') {
    return global as typeof globalThis
  }

  // Last resort: use Function constructor to escape sandboxed environments
  return Function('return this')()
}
