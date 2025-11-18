/**
 * Extracts the element type from a Set.
 * Example: SetItem<Set<string>> === string
 */
export type SetItem<T extends Set<unknown>> = T extends Set<infer U> ? U : never;
