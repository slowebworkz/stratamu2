/**
 * Helper: if size is zero return undefined else return the result of thunk
 */
export function whenNotEmpty<T>(size: number, thunk: () => T): T | undefined {
  return size > 0 ? thunk() : undefined
}
