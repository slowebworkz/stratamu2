import {
  isArrayWithEachItem as _isArrayWithEachItem,
  isNonEmptyArray as _isNonEmptyArray,
} from "guardz"

import type { GuardFn } from "./guard-fn.ts"

export function isNonEmptyArray<T>(value: unknown): value is [T, ...T[]] {
  return _isNonEmptyArray(value as T[])
}

export function isArrayWithEachItem<T>(guard: GuardFn<T>): (value: unknown) => value is T[] {
  return _isArrayWithEachItem(guard)
}
