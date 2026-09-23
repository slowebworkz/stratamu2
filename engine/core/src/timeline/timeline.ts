import { MinHeap } from "mnemonist"

/** One item waiting in the heap, and the due time it is ordered by. */
interface Entry<T> {
  readonly item: T
  readonly dueAt: number
  /** Breaks ties between equal `dueAt`s in insertion order. A heap alone is not stable. */
  readonly sequence: number
}

/**
 * A set of items ordered by due time, not a multiset: `remove(item)` takes the item itself, not
 * an entry or handle id, which only makes sense if each item is scheduled at most once. Items due
 * at the same time keep the order they were inserted in.
 *
 * Backed by a binary heap (`mnemonist`'s `MinHeap`), not the array this held before: a heap gives
 * `insert` and the peek `takeDue`/`nextDueAt` do O(log n)/O(1) instead of the O(n) a sorted
 * array's insert cost. `mnemonist` has no arbitrary-removal heap that fits `Timeline`'s
 * `remove(item)` by value rather than by a decrease-key handle, so removal is layered on top:
 * `#live` maps each scheduled item to its current `Entry` object, and `remove` only updates that,
 * in O(1). A removed entry stays physically in the heap as a tombstone until it would otherwise
 * be the next one looked at, at which point `#settle` discards it.
 *
 * `#live` must map to the `Entry` itself, not merely record that the item is present: an item can
 * be removed and then legitimately inserted again (a reschedule), which leaves its first `Entry`
 * behind as a tombstone with the very same item value the second `Entry` also carries. Checking
 * membership by item value alone cannot tell those two entries apart and would let the stale one
 * be mistaken for current. Comparing the heap's top `Entry` against the one `#live` actually holds
 * for that item, by reference, resolves that ambiguity; a `Set` of items cannot.
 */
export class Timeline<T> {
  readonly #heap = new MinHeap<Entry<T>>((a, b) => a.dueAt - b.dueAt || a.sequence - b.sequence)
  readonly #live = new Map<T, Entry<T>>()
  #nextSequence = 0

  get size(): number {
    return this.#live.size
  }

  /** Throws if `item` is already scheduled: a second heap entry for the same item would be
   * invisible to `remove`, which identifies an item by itself, not by which `insert` call it came
   * from. Reschedule an item by removing it first. */
  insert(item: T, dueAt: number): void {
    if (this.#live.has(item)) {
      throw new Error("This item is already scheduled")
    }
    const entry = { item, dueAt, sequence: this.#nextSequence++ }
    this.#heap.push(entry)
    this.#live.set(item, entry)
  }

  /** Discards heap entries at the top that are tombstones -- removed outright, or superseded by a
   * later `insert` of the same item -- so the top always reflects `#live`'s current entry. */
  #settle(): void {
    let top = this.#heap.peek()
    while (top !== undefined && this.#live.get(top.item) !== top) {
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
