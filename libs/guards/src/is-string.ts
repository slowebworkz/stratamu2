import { isString as _isString } from "guardz"

export function isString(value: unknown): value is string {
  return _isString(value)
}
