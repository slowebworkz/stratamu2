import { isNonNullObject as _isNonNullObject } from "guardz"

export type NonNullObject = Record<number | string, unknown>

export function isNonNullObject(value: unknown): value is NonNullObject {
  return _isNonNullObject(value)
}
