import type { Duration, Instant } from "@stratamu/primitives"

import type { Clock } from "./clock.ts"

/**
 * A clock that moves only when told to. It makes logical time explicit: a pulse counter advanced
 * by a game loop, a round counter advanced by the rules, or a test's fake time.
 *
 * It can only move forward: there is no way to set it, and advancing by a negative duration is
 * refused. That makes it deterministic and safe to schedule on.
 */
export class ManualClock<TDomain> implements Clock<Instant<TDomain>> {
  #current: Instant<TDomain>

  constructor(initial: Instant<TDomain>) {
    this.#current = initial
  }

  now(): Instant<TDomain> {
    return this.#current
  }

  advance(duration: Duration<TDomain>): void {
    if (duration.value < 0n) {
      throw new RangeError(`A clock can only advance by an amount >= 0, received ${duration}`)
    }
    this.#current = this.#current.add(duration)
  }
}
