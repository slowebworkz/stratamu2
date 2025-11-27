/**
 * Convert an arbitrary value to a finite number, or `undefined` when conversion
 * isn't possible or would be ambiguous.
 *
 * Rules:
 * - `null`/`undefined` -> `undefined`
 * - empty or whitespace-only strings -> `undefined` (avoids `'' -> 0` surprises)
 * - numeric strings and numbers -> finite number
 * - non-finite values (NaN, Infinity) -> `undefined`
 */
export function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}
