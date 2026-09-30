import { isOneOf as _isOneOf, isOneOfTypes as _isOneOfTypes } from "guardz"

import type { GuardFn } from "./guard-fn.ts"

export function isOneOf<T extends readonly unknown[]>(
  options: T,
): (value: unknown) => value is T[number] {
  return _isOneOf(...options)
}

export function isOneOfTypes<T>(...guards: GuardFn<T>[]): (value: unknown) => value is T {
  return _isOneOfTypes(...guards)
}
