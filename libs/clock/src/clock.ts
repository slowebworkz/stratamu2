/**
 * A source of time. `T` is what a reading looks like: an `Instant` in some domain for a logical
 * or monotonic clock, a `Timestamp` for the wall clock.
 *
 * Only readings of one clock can be compared. A clock's owner decides what moves it, and that is
 * not part of this contract. Most clocks never move backwards, but not all of them promise it:
 * see `WallClock`.
 */
export interface Clock<T> {
  now(): T
}
