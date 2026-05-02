import type { ReadonlyDeep } from "type-fest"

/**
 * Deeply readonly record type for event constants.
 * @template K - key type (e.g., string, Uppercase<string>)
 * @template V - value type (e.g., number, RegExp)
 */
export type DeepReadonlyRecord<K extends string, V = unknown> = ReadonlyDeep<Record<K, V>>
