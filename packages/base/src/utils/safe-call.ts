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
 * Calls a function that may return a Promise safely, returns a Promise resolving to
 * the result or undefined if it throws.
 */
export async function safeCallAsync<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  ...args: Args
): Promise<R | undefined> {
  // Wrap fn call in safeCall, then await result
  return await safeCall(() => fn(...args))
}
