import { isBoolean as _isBoolean } from "guardz"

export function isBoolean(value: unknown): value is boolean {
  return _isBoolean(value)
}
