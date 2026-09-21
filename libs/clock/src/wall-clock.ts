import { Timestamp } from "@stratamu/primitives"

import type { Clock } from "./clock.ts"

/**
 * The system's wall-clock time: Unix time in milliseconds.
 *
 * It is for timestamps: logging, persistence, and showing the time to people. Unlike
 * `MonotonicClock`, it can move backwards when the system time is adjusted, so do not schedule
 * work on it. It belongs to the runtime environment and not to replayable logic.
 */
export class WallClock implements Clock<Timestamp> {
  now(): Timestamp {
    return Timestamp.fromMilliseconds(BigInt(Date.now()))
  }
}
