import { isNonEmptyString as _isNonEmptyString } from "guardz"

export function isNonEmptyString(value: unknown): value is string {
  return _isNonEmptyString(value)
}
