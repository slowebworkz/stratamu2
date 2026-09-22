import type { LaneId } from "./types.ts"

/** A queue of ready items, kept in the order they were added. */
export class Lane<T> {
  readonly id: LaneId
  #items: T[] = []

  constructor(id: LaneId) {
    this.id = id
  }

  get size(): number {
    return this.#items.length
  }

  enqueue(item: T): void {
    this.#items.push(item)
  }

  items(): IterableIterator<T> {
    return this.#items.values()
  }

  remove(item: T): boolean {
    const index = this.#items.indexOf(item)
    if (index === -1) {
      return false
    }
    this.#items.splice(index, 1)
    return true
  }
}
