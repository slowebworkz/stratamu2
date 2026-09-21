import { TemporalValue } from "./temporal-value.ts"

/**
 * A wall-clock time: milliseconds since the Unix epoch.
 *
 * Its meaning is fixed, so it has no domain parameter.
 */
export class Timestamp extends TemporalValue<Timestamp> {
  private constructor(milliseconds: bigint) {
    super(milliseconds)
  }

  static fromMilliseconds(milliseconds: bigint): Timestamp {
    return new Timestamp(milliseconds)
  }

  static fromNumber(milliseconds: number): Timestamp {
    if (!Number.isSafeInteger(milliseconds)) {
      throw new RangeError("Timestamp milliseconds must be a safe integer")
    }

    return new Timestamp(BigInt(milliseconds))
  }

  static fromDate(date: Date): Timestamp {
    return Timestamp.fromNumber(date.getTime())
  }

  get milliseconds(): bigint {
    return this.value
  }

  protected create(value: bigint): Timestamp {
    return new Timestamp(value)
  }

  add(milliseconds: bigint): Timestamp {
    return this.addValue(milliseconds)
  }

  subtract(milliseconds: bigint): Timestamp {
    return this.subtractValue(milliseconds)
  }

  toDate(): Date {
    const milliseconds = Number(this.value)
    const date = new Date(milliseconds)

    if (Number.isNaN(date.getTime())) {
      throw new RangeError("Timestamp cannot be represented by JavaScript Date")
    }

    return date
  }

  toISOString(): string {
    return this.toDate().toISOString()
  }

  toJSON(): string {
    return this.value.toString()
  }
}
