/**
 * Type for list index arguments.
 */
export type ListIndex = number

/**
 * Comparator function for sorting or ordering values.
 */
export type Comparator<T> = (a: T, b: T) => number

/**
 * Accepts any iterable or array-like object.
 */
export type IterableSource<T> = Iterable<T> | ArrayLike<T>

/**
 * Predicate for a value (no index).
 */
export type ValuePredicate<T> = (value: T) => boolean

/**
 * Predicate for a value and its index.
 */
export type IndexedPredicate<T> = (value: T, index: number) => boolean
