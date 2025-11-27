import type { Comparator, ListIndex, IndexedPredicate, ValuePredicate } from "@/data"
import { BaseError } from "@/errors"
import { isObject } from "@/utils"

/** Branding symbol for priority lists - prevents type confusion */
const PRIORITY_LIST_BRAND = Symbol("__priorityList")

/** Branded type for priority-based LinkedLists */
export interface PriorityListBrand {
  readonly [PRIORITY_LIST_BRAND]: true
}

export interface PriorityItem {
  priority: number
  sequence: number
}

/**
 * Minimal singly-linked list in TypeScript.
 * Small, well-typed, iterable, and easy to extend.
 */

export type PriorityList<T extends PriorityItem> = LinkedList<T> & PriorityListBrand







export class LinkedList<T> implements Iterable<T> {
  protected head: ListNode<T> | null = null
  protected tail: ListNode<T> | null = null
  protected _size = 0
  private comparatorFn?: Comparator<T>

  /**
   * Create a linked list.
   * - Pass an iterable to fill it with values.
   * - Pass a comparator to make it a "sorted list".
   */
  constructor(
    itemsOrComparator?: Iterable<T> | Comparator<T>,
    comparator?: Comparator<T>
  ) {
    if (typeof itemsOrComparator === "function") {
      this.comparatorFn = itemsOrComparator
    } else if (itemsOrComparator) {
      // Set comparatorFn first if provided
      if (comparator) this.comparatorFn = comparator

      // Now add items (they will be sorted if comparatorFn is set)
      for (const item of itemsOrComparator) this.push(item)
    }

    // Set comparatorFn if it wasn't set above
    if (comparator && !this.comparatorFn) this.comparatorFn = comparator
  }

  /**
   * Create a LinkedList from an array or iterable.
   * @warning This always returns a plain LinkedList, never a branded PriorityList. Use {@link LinkedList.fromPriorityArray} for branded lists.
   * @param items - Items to add to the list
   * @returns A new LinkedList containing the items
   */
  public static fromArray<U>(items: Iterable<U>): LinkedList<U> {
    return new LinkedList(items)
  }

  /**
   * Create a branded PriorityList from an array or iterable of items with priority and sequence.
   * @param items - Items to add (must have priority and sequence)
   * @returns A branded PriorityList
   * @example
   * const pl = LinkedList.fromPriorityArray([
   *   { priority: 2, sequence: 1 },
   *   { priority: 1, sequence: 2 }
   * ])
   */
  public static fromPriorityArray<T extends PriorityItem>(items: Iterable<T>): PriorityList<T> {
    const list = LinkedList.createPriorityList<T>()
    for (const item of items) {
      list.push(item)
    }
    return list
  }

  /**
   * Create a branded PriorityList for items with priority and sequence properties.
   * Uses higher priority first, FIFO within same priority.
   * @returns A branded PriorityList
   * @example
   * const taskQueue = LinkedList.createPriorityList<Task>()
   * taskQueue.push({ name: 'urgent', priority: 10, sequence: 1 })
   * taskQueue.push({ name: 'normal', priority: 5, sequence: 2 })
   */
  public static createPriorityList<T extends PriorityItem>(): PriorityList<T> {
    const list = new LinkedList<T>((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      return a.sequence - b.sequence // FIFO within same priority
    })

    // Add branding for type safety
    Object.defineProperty(list, PRIORITY_LIST_BRAND, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    })

    return list as unknown as PriorityList<T>
  }

  /**
   * Type guard to check if a LinkedList is a branded PriorityList.
   * @param list - LinkedList to check
   * @returns True if the list is a branded PriorityList
   */
  /**
   * Type guard to check if a value is a branded PriorityList.
   * Accepts unknown for defensive API usage.
   */
  public static isPriorityList(
    value: unknown,
  ): value is LinkedList<PriorityItem> & PriorityListBrand {
    return (
      isObject(value) &&
      PRIORITY_LIST_BRAND in value &&
      (value as Partial<PriorityListBrand>)[PRIORITY_LIST_BRAND] === true
    )
  }

  /**
   * Insert a value into a LinkedList (branded or unbranded) in stable, priority order (FIFO for equal priorities).
   * Always inserts after the last node with the same priority, or before the first node with lower priority.
   *
   * @param list - The LinkedList or branded PriorityList
   * @param value - The value to insert (must have a numeric `priority` property)
   */
  public static stablePriorityInsert<T extends PriorityItem>(
    list: LinkedList<T>,
    value: T,
  ): void {
    if ((list as LinkedList<T>).comparatorFn) {
      throw new BaseError("stablePriorityInsert() cannot be used on a sorted LinkedList")
    }
    LinkedList._insertByPriorityOrder(list, value)
    // Removed duplicate signature
  }

  /**
   * Private helper for stable, priority-based insertion (FIFO for equal priorities).
   */
  private static _insertByPriorityOrder<T extends PriorityItem>(
    list: LinkedList<T>,
    value: T,
  ): void {
    if (list._size === 0 || !list.head) {
      list.push(value)
      return
    }
    if (value.priority > list.head.value.priority) {
      list.unshift(value)
      return
    }

    let { head: previousNode } = list
    let currentNode = previousNode?.next
    while (
      currentNode &&
      (
        currentNode.value.priority > value.priority ||
        (
          currentNode.value.priority === value.priority &&
          currentNode.value.sequence <= value.sequence
        )
      )
    ) {
      previousNode = currentNode
      currentNode = currentNode.next
    }
    const newNode = new ListNode<T>(value)
    newNode.next = currentNode
    previousNode.next = newNode
    if (!currentNode) list.tail = newNode
    list._size++
  }

  /**
   * Number of items in the list (O(1)).
   */
  public get size(): number {
    return this._size
  }

  /**
   * Add to the end (or sorted insert if compareFn is set).
   * @param value - Value to add
   * @returns This list
   */
  public push(value: T): this {
    if (this.comparatorFn) return this.sortedInsert(value, this.comparatorFn)
    const node = new ListNode(value)
    if (!this.head) {
      this.head = this.tail = node
    } else if (this.tail) {
      this.tail.next = node
      this.tail = node
    }
    this._size++
    return this
  }

  /**
   * Add to the front (or sorted insert if compareFn is set).
   *
   * In sorted mode, this method ignores positional intent and inserts by sort order.
   *
   * @param value - Value to add
   * @returns This list
   */
  public unshift(value: T): this {
    if (this.comparatorFn) {
      throw new BaseError("Cannot use unshift() on a sorted LinkedList")
    }
    const node = new ListNode(value)
    node.next = this.head
    this.head = node
    if (!this.tail) this.tail = node
    this._size++
    return this
  }

  /**
   * Remove from the front.
   * @returns The removed value, or undefined if empty
   */
  public shift(): T | undefined {
    if (!this.head) return undefined
    const v = this.head.value
    this.head = this.head.next
    if (!this.head) this.tail = null
    this._size--
    return v
  }

  /**
   * Peek at the first value in the list (head), or undefined if empty.
   * Common for queue/stack usage.
   */
  public peek(): T | undefined {
    return this.head?.value
  }

  /**
   * Get the last value in the list (tail), or undefined if empty.
   * Uses tail directly for O(1) access.
   */
  public last(): T | undefined {
    return this.tail?.value
  }

  /**
   * Get node value at index (0-based).
   * @param index - Index to retrieve
   * @returns Value at index, or undefined
   */
  public get(index: ListIndex): T | undefined {
    if (index < 0 || index >= this._size) return undefined
    let i = 0
    let cur = this.head
    while (cur && i < index) {
      cur = cur.next
      i++
    }
    return cur?.value
  }

  /**
   * Remove first occurrence of value (uses strict equality, identity-based for objects).
   * @param value - Value to remove (must be strictly equal)
   * @returns True if an item was removed, false otherwise
   */
  public remove(value: T): boolean {
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

  /**
   * Convert the list to an array.
   * @returns Array of all values
   */
  public toArray(): T[] {
    const out: T[] = []
    let cur = this.head
    while (cur) {
      out.push(cur.value)
      cur = cur.next
    }
    return out
  }

  /**
   * Returns a new array of all items matching the predicate.
   * @param predicate - Function to test each value and index
   * @returns Array of matching values
   */
  public filter(predicate: IndexedPredicate<T>): T[] {
    const result: T[] = []
    let i = 0
    for (const v of this) {
      if (predicate(v, i)) result.push(v)
      i++
    }
    return result
  }

  /**
   * Find the first item matching the predicate.
   * @param predicate - Function to test each value and index
   * @returns First matching value or undefined
   */
  public find(predicate: IndexedPredicate<T>): T | undefined {
    let i = 0
    for (const value of this) {
      if (predicate(value, i)) return value
      i++
    }
    return undefined
  }

  /**
   * Remove all items matching the predicate (removes during traversal).
   * @param predicate - Function to test each value
   * @returns Number of items removed
   * @example
   * const removed = list.removeWhere(listener => listener.priority >= 5)
   */
  public removeWhere(predicate: ValuePredicate<T>): number {
    let removed = 0
    let cur = this.head
    let prev: ListNode<T> | null = null

    while (cur) {
      if (predicate(cur.value)) {
        // Remove this node
        const next = cur.next

        if (prev) {
          prev.next = next
        } else {
          this.head = next
        }

        if (cur === this.tail) {
          this.tail = prev
        }

        this._size--
        removed++
        cur = next
      } else {
        prev = cur
        cur = cur.next
      }
    }

    return removed
  }

  /**
   * Remove all items from the list.
   */
  public clear(): void {
    this.head = this.tail = null
    this._size = 0
  }

  /**
   * Insert at index (0..size).
   *
   * In sorted mode, this method ignores positional intent and inserts by sort order.
   *
   * @param index - Index to insert at
   * @param value - Value to insert
   * @returns True if inserted, false if index invalid
   */
  public insertAt(index: ListIndex, value: T): boolean {
    if (this.comparatorFn) {
      throw new BaseError("insertAt() is not allowed on a sorted LinkedList")
    }
    if (index < 0 || index > this._size) return false
    if (index === 0) return !!this.unshift(value) // always true
    if (index === this._size) {
      this.push(value)
      return true
    }
    let i = 0
    let prev = this.head
    if (!prev) return false // Safety check
    while (i < index - 1) {
      if (!prev.next) return false // Safety check
      prev = prev.next
      i++
    }
    const node = new ListNode(value)
    node.next = prev.next
    prev.next = node
    this._size++
    return true
  }

  /**
   * Insert value into the list in sorted order.
   * @param value - Value to insert
   * @param compareFn - Comparator function (optional)
   * @returns This list
   * @throws Error if no comparator is available for objects
   */
  public sortedInsert(value: T, compareFn?: Comparator<T>): this {
    let cmp: Comparator<T>
    if (compareFn) {
      cmp = compareFn
    } else if (this.comparatorFn) {
      cmp = this.comparatorFn
    } else {
      // Fallback: only safe for primitives
      if (isObject(value) || (this.head && isObject(this.head.value))) {
        throw new BaseError("No compareFn provided for sortedInsert on objects")
      }
      cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
    }

    const node = new ListNode(value)

    // If the list is empty, insert as the only node
    if (!this.head) {
      this.head = this.tail = node
      this._size++
      return this
    }

    // If should be inserted at the head
    if (cmp(value, this.head.value) < 0) {
      node.next = this.head
      this.head = node
      this._size++
      return this
    }

    // Traverse to find the correct spot (stable: insert after equals)
    let prev = this.head
    let cur = this.head.next
    while (cur && cmp(value, cur.value) >= 0) {
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

  /**
   * Iterate over values in the list.
   */
  public *[Symbol.iterator](): Iterator<T> {
    let cur = this.head
    while (cur) {
      yield cur.value
      cur = cur.next
    }
  }

  /**
   * Call a function for each value in the list.
   * @param fn - Function to call with (value, index)
   */
  public forEach(fn: (value: T, index: number) => void): void {
    let i = 0
    for (const v of this) {
      fn(v, i++)
    }
  }
}







export class ListNode<T> {
  value: T
  next: ListNode<T> | null = null
  constructor(value: T) {
    this.value = value
  }
}




// Export Node type for external use (e.g., event emitter filterGroups)
export type Node<T> = ListNode<T>
