/** Items ordered by due time. Items due at the same time keep the order they were inserted in. */
export class Timeline<T> {
  #entries: { item: T; dueAt: number }[] = []

  get size(): number {
    return this.#entries.length
  }

  insert(item: T, dueAt: number): void {
    // Insert after every entry due at or before `dueAt`, which keeps ties in insertion order.
    let low = 0
    let high = this.#entries.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if ((this.#entries[middle] as { dueAt: number }).dueAt <= dueAt) {
        low = middle + 1
      } else {
        high = middle
      }
    }
    this.#entries.splice(low, 0, { item, dueAt })
  }

  /** Removes and returns the earliest item due at `now`, if any. */
  takeDue(now: number): T | undefined {
    const first = this.#entries[0]
    if (first === undefined || first.dueAt > now) {
      return undefined
    }
    this.#entries.shift()
    return first.item
  }

  nextDueAt(): number | undefined {
    return this.#entries[0]?.dueAt
  }

  remove(item: T): boolean {
    const index = this.#entries.findIndex(entry => entry.item === item)
    if (index === -1) {
      return false
    }
    this.#entries.splice(index, 1)
    return true
  }
}
