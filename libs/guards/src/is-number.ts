import {
  isInteger as _isInteger,
  isNonNegativeInteger as _isNonNegativeInteger,
  isNumber as _isNumber,
  isPositiveInteger as _isPositiveInteger,
} from "guardz"

export function isNumber(value: unknown): value is number {
  return _isNumber(value)
}

export function isInteger(value: unknown): value is number {
  return _isInteger(value)
}

export function isPositiveInteger(value: unknown): value is number {
  return _isPositiveInteger(value)
}

export function isNonNegativeInteger(value: unknown): value is number {
  return _isNonNegativeInteger(value)
}
