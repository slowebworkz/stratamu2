/** src/index.ts */

/**
 * Minimal singly-linked list in TypeScript.
 * Small, well-typed, iterable, and easy to extend.
 */

export class ListNode<T> {
  value: T

  next: ListNode<T> | null = null

  constructor(value: T) {
    this.value = value
  }
}

export class LinkedList<T> implements Iterable<T> {
  /**
   * Returns a new array of all items matching the predicate.
   */
  filter(predicate: (value: T, index: number) => boolean): T[] {
    const result: T[] = []
    let i = 0
    for (const v of this) {
      if (predicate(v, i)) result.push(v)
      i++
    }
    return result
  }
  private head: ListNode<T> | null = null
  private tail: ListNode<T> | null = null
  private _size = 0
  private compareFn?: (a: T, b: T) => number

  /**
   * Create a linked list.
   * - Pass an iterable to fill it with values.
   * - Pass a comparator to make it a "sorted list".
   */
  constructor(
    iterableOrCompare?: Iterable<T> | ((a: T, b: T) => number),
    maybeCompare?: (a: T, b: T) => number,
  ) {
    if (typeof iterableOrCompare === 'function') {
      this.compareFn = iterableOrCompare
    } else if (iterableOrCompare) {
      for (const v of iterableOrCompare) this.push(v)
    }

    if (maybeCompare) this.compareFn = maybeCompare
  }

  /** Number of items */
  get size(): number {
    return this._size
  }

  /** Add to the end (or sorted insert if compareFn is set) */
  push(value: T): this {
    if (this.compareFn) return this.sortedInsert(value, this.compareFn)
    const node = new ListNode(value)
    if (!this.head) {
      this.head = this.tail = node
    } else {
      this.tail!.next = node
      this.tail = node
    }
    this._size++
    return this
  }

  /** Add to the front (or sorted insert if compareFn is set) */
  unshift(value: T): this {
    if (this.compareFn) return this.sortedInsert(value, this.compareFn)
    const node = new ListNode(value)
    node.next = this.head
    this.head = node
    if (!this.tail) this.tail = node
    this._size++
    return this
  }

  /** Remove from the front */
  shift(): T | undefined {
    if (!this.head) return undefined
    const v = this.head.value
    this.head = this.head.next
    if (!this.head) this.tail = null
    this._size--
    return v
  }

  /** Get node value at index (0-based) */
  get(index: number): T | undefined {
    if (index < 0 || index >= this._size) return undefined
    let i = 0
    let cur = this.head
    while (cur && i < index) {
      cur = cur.next
      i++
    }
    return cur?.value
  }

  /** Remove first occurrence of value (uses strict equality) */
  remove(value: T): boolean {
    if (!this.head) return false
    if (this.head.value === value) {
      this.head = this.head.next
      if (!this.head) this.tail = null
      this._size--
      return true
    }
    let prev = this.head
    let cur = this.head.next
    while (cur) {
      if (cur.value === value) {
        prev.next = cur.next
        if (cur === this.tail) this.tail = prev
        this._size--
        return true
      }
      prev = cur
      cur = cur.next
    }
    return false
  }

  /** Convert to array */
  toArray(): T[] {
    const out: T[] = []
    let cur = this.head
    while (cur) {
      out.push(cur.value)
      cur = cur.next
    }
    return out
  }

  /** Clear list */
  clear(): void {
    this.head = this.tail = null
    this._size = 0
  }

  /** Create from array/iterable */
  static fromArray<U>(items: Iterable<U>): LinkedList<U> {
    return new LinkedList(items)
  }

  /** Iterate over values */
  *[Symbol.iterator](): Iterator<T> {
    let cur = this.head
    while (cur) {
      yield cur.value
      cur = cur.next
    }
  }

  /** forEach helper */
  forEach(fn: (value: T, index: number) => void): void {
    let i = 0
    for (const v of this) {
      fn(v, i++)
    }
  }

  /** Insert at index (0..size). returns false if index invalid */
  insertAt(index: number, value: T): boolean {
    if (index < 0 || index > this._size) return false
    if (index === 0) return !!this.unshift(value) // always true
    if (index === this._size) {
      this.push(value)
      return true
    }
    let i = 0
    let prev = this.head!
    while (i < index - 1) {
      prev = prev.next!
      i++
    }
    const node = new ListNode(value)
    node.next = prev.next
    prev.next = node
    this._size++
    return true
  }

  /** Insert value into the list in sorted order */
  sortedInsert(
    value: T,
    compareFn: (a: T, b: T) => number = this.compareFn ?? ((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  ): this {
    const node = new ListNode(value)

    // If the list is empty, insert as the only node
    if (!this.head) {
      this.head = this.tail = node
      this._size++
      return this
    }

    // If should be inserted at the head
    if (compareFn(value, this.head.value) <= 0) {
      node.next = this.head
      this.head = node
      this._size++
      return this
    }

    // Traverse to find the correct spot
    let prev = this.head
    let cur = this.head.next
    while (cur && compareFn(value, cur.value) > 0) {
      prev = cur
      cur = cur.next
    }

    // Insert between prev and cur
    node.next = cur
    prev.next = node

    // If inserted at the end, update tail
    if (!cur) this.tail = node

    this._size++
    return this
  }
}
