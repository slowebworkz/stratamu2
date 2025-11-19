/**
 * Represents a time duration in milliseconds.
 */
export type Milliseconds = number

import { toNumber } from "@/data"

/**
 * Normalizes an arbitrary value into a valid positive integer number of milliseconds.
 *
 * - Converts strings like `"500"` to `500`
 * - Returns `undefined` for non-finite, NaN, nullish, or non-positive values
 * - Ensures the value is safe to pass into functions like `setTimeout` or `AbortSignal.timeout`
 *
 * @param timeout - The input value to normalize (number, string, etc.)
 * @returns A positive integer number of milliseconds, or `undefined` if invalid
 */
export function normalizeTimeout(timeout: unknown): Milliseconds | undefined {
  const n = toNumber(timeout)
  if (n === undefined || n < 1) return undefined

  return Math.floor(n)
}
