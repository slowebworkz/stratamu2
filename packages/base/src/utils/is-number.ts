/**
 * Determines if a value is a number primitive or a Number object (including cross-realm objects).
 *
 * @param arg - The value to test.
 * @returns {arg is number} True if the value is a number primitive or a Number object, otherwise false.
 *
 * @example
 *   isNumber(42); // true
 *   isNumber(new Number(5)); // true
 *   isNumber('42'); // false
 *   isNumber(NaN); // true
 *   isNumber(undefined); // false
 *
 * @remarks
 * This function checks both number primitives and boxed Number objects,
 * including those created in other JavaScript realms (e.g., iframes).
 * It does not consider numeric strings, BigInt, or any other types as numbers.
 */
export function isNumber(arg: unknown): arg is number {
  // Fast path: number primitive
  if (typeof arg === "number") {
    return true
  }

  // Cross-realm Number object detection
  if (arg !== null && typeof arg === "object") {
    return Object.prototype.toString.call(arg) === "[object Number]"
  }

  return false
}

/**
 * Determines if a value is a finite number (not NaN, Infinity, or -Infinity).
 *
 * @param arg - The value to test.
 * @returns {arg is number} True if the value is a finite number, otherwise false.
 *
 * @example
 *   isFiniteNumber(1.5); // true
 *   isFiniteNumber(Infinity); // false
 *   isFiniteNumber(NaN); // false
 *   isFiniteNumber('5'); // false
 *
 * @remarks
 * This function first verifies that the value is a number (primitive or Number object),
 * and then ensures it is finite using Number.isFinite. Number objects are correctly
 * coerced to their primitive numeric value.
 */
export function isFiniteNumber(arg: unknown): arg is number {
  if (!isNumber(arg)) {
    return false
  }

  return Number.isFinite(arg as number)
}

/**
 * Determines if a value is the special NaN value (Not-a-Number).
 *
 * @param arg - The value to test.
 * @returns {boolean} True if the value is NaN, otherwise false.
 *
 * @example
 *   isNaNValue(NaN); // true
 *   isNaNValue(42); // false
 *   isNaNValue('foo'); // false
 *
 * @remarks
 * Returns true only for numeric NaN (primitive or Number object with NaN inside).
 * It deliberately does not treat non-number values as NaN.
 */
export function isNaNValue(arg: unknown): boolean {
  return isNumber(arg) && Number.isNaN(arg as number)
}
