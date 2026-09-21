import { Duration } from "./duration.ts"
import { TemporalValue } from "./temporal-value.ts"

/** A point within a specific temporal domain. */
export class Instant<TDomain> extends TemporalValue<Instant<TDomain>> {
  // Phantom field: see Duration. Protected so that its type survives declaration emit.
  declare protected readonly __domain: (value: TDomain) => TDomain

  private constructor(value: bigint) {
    super(value)
  }

  static from<TDomain>(value: bigint): Instant<TDomain> {
    return new Instant<TDomain>(value)
  }

  static zero<TDomain>(): Instant<TDomain> {
    return new Instant<TDomain>(0n)
  }

  protected create(value: bigint): Instant<TDomain> {
    return new Instant<TDomain>(value)
  }

  add(duration: Duration<TDomain>): Instant<TDomain> {
    return this.addValue(duration.value)
  }

  subtract(duration: Duration<TDomain>): Instant<TDomain> {
    return this.subtractValue(duration.value)
  }

  durationSince(other: Instant<TDomain>): Duration<TDomain> {
    return Duration.from<TDomain>(this.value - other.value)
  }
}
