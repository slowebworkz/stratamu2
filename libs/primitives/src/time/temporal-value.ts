/**
 * The shared core of the time values: a whole number of some unit, held as a `bigint`.
 *
 * `TSelf` is the concrete subclass. It types the results of arithmetic and the operand of
 * comparisons, so no cast is needed and values of different domains cannot be compared.
 */
export abstract class TemporalValue<TSelf extends TemporalValue<TSelf>> {
  readonly #value: bigint

  protected constructor(value: bigint) {
    this.#value = value
  }

  get value(): bigint {
    return this.#value
  }

  protected abstract create(value: bigint): TSelf

  protected addValue(amount: bigint): TSelf {
    return this.create(this.#value + amount)
  }

  protected subtractValue(amount: bigint): TSelf {
    return this.create(this.#value - amount)
  }

  compare(other: TSelf): number {
    return this.#value < other.#value ? -1 : this.#value > other.#value ? 1 : 0
  }

  equals(other: TSelf): boolean {
    return this.#value === other.#value
  }

  isBefore(other: TSelf): boolean {
    return this.#value < other.#value
  }

  isAfter(other: TSelf): boolean {
    return this.#value > other.#value
  }

  toString(): string {
    return this.#value.toString()
  }
}
