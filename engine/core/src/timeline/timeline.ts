import { MinHeap } from "mnemonist"

/** One item waiting in the heap, and the due time it is ordered by. */
interface Entry<T> {
  readonly item: T
  readonly dueAt: number
  /** Breaks ties between equal `dueAt`s in insertion order. A heap alone is not stable. */
  readonly sequence: number
}

/**
 * Items ordered by due time. Items due at the same time keep the order they were inserted in.
 *
 * Backed by a binary heap (`mnemonist`'s `MinHeap`), not the array this held before: a heap gives
 * `insert` and the peek `takeDue`/`nextDueAt` do O(log n)/O(1) instead of the O(n) a sorted
 * array's insert cost. `mnemonist` has no arbitrary-removal heap that fits `Timeline`'s
 * `remove(item)` by value rather than by a decrease-key handle, so removal is layered on top:
 * `#live` is the source of truth for membership, and `remove` only updates that, in O(1). A
 * removed entry stays physically in the heap as a tombstone until it would otherwise be the next
 * one looked at, at which point `#settle` discards it. Every entry is tombstoned and discarded at
 * most once over its lifetime, so this stays amortized O(log n) per real operation, not O(n).
 */
export class Timeline<T> {
  readonly #heap = new MinHeap<Entry<T>>((a, b) => a.dueAt - b.dueAt || a.sequence - b.sequence)
  readonly #live = new Set<T>()
  #nextSequence = 0

  get size(): number {
    return this.#live.size
  }

  insert(item: T, dueAt: number): void {
    this.#heap.push({ item, dueAt, sequence: this.#nextSequence++ })
    this.#live.add(item)
  }

  /** Discards heap entries at the top that `remove` already tombstoned, so the top always
   * reflects a live item. */
  #settle(): void {
    let top = this.#heap.peek()
    while (top !== undefined && !this.#live.has(top.item)) {
      this.#heap.pop()
      top = this.#heap.peek()
    }
  }

  /** Removes and returns the earliest item due at `now`, if any. */
  takeDue(now: number): T | undefined {
    this.#settle()
    const top = this.#heap.peek()
    if (top === undefined || top.dueAt > now) {
      return undefined
    }
    this.#heap.pop()
    this.#live.delete(top.item)
    return top.item
  }

  nextDueAt(): number | undefined {
    this.#settle()
    return this.#heap.peek()?.dueAt
  }

  remove(item: T): boolean {
    return this.#live.delete(item)
  }
}
