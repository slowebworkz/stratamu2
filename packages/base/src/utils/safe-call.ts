import type { Awaitable } from "@repo/types"

/**
 * Calls a synchronous function safely, returns its result or undefined if it throws.
 */
export function safeCall<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  ...args: Args
): R | undefined {
  try {
    return fn(...args)
  } catch {
    return undefined
  }
}

/**
 * Calls a function that may return a Promise safely.
 * Catches synchronous throws and rejected Promises.
 * Returns a Promise resolving to the result or undefined if it throws.
 */
export async function safeCallAsync<Args extends unknown[], R>(
  fn: (...args: Args) => Awaitable<R>,
  ...args: Args
): Promise<R | undefined> {
  try {
    return await fn(...args)
  } catch {
    return undefined
  }
}
