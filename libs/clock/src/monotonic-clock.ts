import { performance } from "node:perf_hooks"

import { Instant } from "@stratamu/primitives"

import type { Clock } from "./clock.ts"

// A type-only marker: it has no runtime value, and only `MonotonicTime` is exported by the package.
export declare const monotonicTimeDomain: unique symbol

/** The domain of `MonotonicClock`: whole milliseconds from an arbitrary origin. */
export type MonotonicTime = typeof monotonicTimeDomain

/**
 * Whole milliseconds from the platform's monotonic timer, measured from an arbitrary origin such
 * as process start. It never moves backwards and is not affected by changes to the system time.
 *
 * `performance.now()` is a fractional number of milliseconds, and flooring it makes 1 ms the
 * resolution of this clock. That is deliberate: a scheduling clock does not need more, and the
 * reading stays a whole number that is exact as a JavaScript number.
 *
 * It advances on its own, so it belongs to the runtime environment and not to logic that must be
 * replayable.
 */
export class MonotonicClock implements Clock<Instant<MonotonicTime>> {
  now(): Instant<MonotonicTime> {
    return Instant.from<MonotonicTime>(BigInt(Math.floor(performance.now())))
  }
}
