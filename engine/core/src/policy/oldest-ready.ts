import type { ClockId } from "../clock/index.ts"
import type { ExecutionPolicy, OldestReadyOptions, ReadyTask } from "./types.ts"

/**
 * Runs the task that became ready earliest, across all lanes. Tasks that became ready together
 * from the same clock run in due order, then in submission order. Tasks that became ready
 * together from different clocks have no natural order, so this policy orders them by
 * `clockOrder`, which makes that relationship explicit rather than accidental.
 */
export function oldestReady(options: OldestReadyOptions = {}): ExecutionPolicy {
  const rank = new Map((options.clockOrder ?? []).map((clock, index) => [clock, index]))

  function compareClocks(a: ClockId | undefined, b: ClockId | undefined): number {
    if (a === b) {
      return 0
    }
    if (a === undefined) {
      return -1
    }
    if (b === undefined) {
      return 1
    }

    const rankA = rank.get(a)
    const rankB = rank.get(b)
    if (rankA !== undefined && rankB !== undefined) {
      return rankA - rankB
    }
    if (rankA !== undefined) {
      return -1
    }
    if (rankB !== undefined) {
      return 1
    }
    return a < b ? -1 : 1
  }

  function compare(a: ReadyTask, b: ReadyTask): number {
    if (a.batch !== b.batch) {
      return a.batch - b.batch
    }
    const byClock = compareClocks(a.via?.clock, b.via?.clock)
    if (byClock !== 0) {
      return byClock
    }
    const byDue = (a.via?.dueAt ?? 0) - (b.via?.dueAt ?? 0)
    if (byDue !== 0) {
      return byDue
    }
    return a.task.sequence - b.task.sequence
  }

  return {
    next(lanes) {
      let oldest: ReadyTask | undefined
      for (const lane of lanes) {
        for (const ready of lane.items()) {
          if (oldest === undefined || compare(ready, oldest) < 0) {
            oldest = ready
          }
        }
      }
      return oldest?.task.id
    },
  }
}
