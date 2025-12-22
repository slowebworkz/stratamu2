/**
 * Utility type to extract the payload type from a tuple.
 *
 * @template T extends any[]
 */
export type ExtractPayload<T> = T extends [infer U] ? U : never
