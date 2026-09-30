import {
  isDefined as _isDefined,
  isNil as _isNil,
  isNilOr as _isNilOr,
  isNullOr as _isNullOr,
  isUndefinedOr as _isUndefinedOr,
} from "guardz"

import type { GuardFn } from "./guard-fn.ts"

export function isDefined<T>(value: T | null | undefined): value is T {
  return _isDefined(value)
}

export function isNil(value: unknown): value is null | undefined {
  return _isNil(value)
}

export function isNilOr<T>(guard: GuardFn<T>): (value: unknown) => value is T | null | undefined {
  return _isNilOr(guard)
}

export function isNullOr<T>(guard: GuardFn<T>): (value: unknown) => value is T | null {
  return _isNullOr(guard)
}

export function isUndefinedOr<T>(guard: GuardFn<T>): (value: unknown) => value is T | undefined {
  return _isUndefinedOr(guard)
}
