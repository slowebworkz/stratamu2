import { TemporalValue } from "./temporal-value.ts"

/**
 * An elapsed amount within a specific temporal domain.
 *
 * The domain is intentionally generic:
 *
 *   Duration<RealTime>
 *   Duration<DikuPulse>
 *   Duration<GameTime>
 *
 * These are not interchangeable.
 */
export class Duration<TDomain> extends TemporalValue<Duration<TDomain>> {
  declare private readonly __domain: (value: TDomain) => TDomain

  private constructor(value: bigint) {
    super(value)
  }

  static from<TDomain>(value: bigint): Duration<TDomain> {
    return new Duration<TDomain>(value)
  }

  static zero<TDomain>(): Duration<TDomain> {
    return new Duration<TDomain>(0n)
  }

  protected create(value: bigint): Duration<TDomain> {
    return new Duration<TDomain>(value)
  }

  add(other: Duration<TDomain>): Duration<TDomain> {
    return this.addValue(other.value)
  }

  subtract(other: Duration<TDomain>): Duration<TDomain> {
    return this.subtractValue(other.value)
  }
}
