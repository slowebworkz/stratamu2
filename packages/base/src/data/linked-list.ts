import type { Comparator, IndexedPredicate, ListIndex, ValuePredicate } from "@/data"
import { DEV_MODE } from "@/env"
import { BaseError } from "@/errors"
import { isObject } from "@/utils"

/** Branding symbol for priority lists - prevents type confusion */
const PRIORITY_LIST_BRAND = Symbol("__priorityList")

/**
 * Branded type for priority-based LinkedLists.
 *
 * This is a pragmatic approach for type safety and intent, but does not enforce strict usage.
 */
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
 *
 * For priority order, always use a PriorityList (created via createPriorityList or fromPriorityArray),
 * which is a sorted LinkedList using the canonical comparator (comparePriorityItem).
 *
 * PriorityList branding is informational, not behavioral: it does not restrict the API surface or enforce usage at compile time.
 *
 * There is no manual stable priority insertion: all priority logic is unified and enforced by the comparator.
 */

export type PriorityList<T extends PriorityItem> = LinkedList<T> & PriorityListBrand

export class LinkedList<T> implements Iterable<T> {
  protected head: ListNode<T> | null = null
  protected tail: ListNode<T> | null = null
  protected _size = 0
  private comparatorFn?: Comparator<T>

  /**
   * Private helper: Insert node at head.
   */
  private _insertNodeAtHead(node: ListNode<T>): void {
    node.next = this.head
    this.head = node
    if (!this.tail) this.tail = node
    this._size++
    this._checkInvariants()
  }

  /**
   * Private helper: Insert node at tail.
   */
  private _insertNodeAtTail(node: ListNode<T>): void {
    if (!this.head) {
      this.head = this.tail = node
    } else if (this.tail) {
      this.tail.next = node
      this.tail = node
    }
    this._size++
    this._checkInvariants()
  }

  /**
   * Private helper: Insert node after prevNode.
   */
  private _insertNodeAfter(prevNode: ListNode<T>, node: ListNode<T>): void {
    node.next = prevNode.next
    prevNode.next = node
    if (this.tail === prevNode) this.tail = node
    this._size++
    this._checkInvariants()
  }

  /**
   * Private helper: Remove node after prevNode (or head if prevNode is null).
   * Returns the removed node or null if not found.
   */
  private _removeNode(prevNode: ListNode<T> | null): ListNode<T> | null {
    let removed: ListNode<T> | null
    if (!prevNode) {
      // Remove head
      removed = this.head
      if (this.head) {
        this.head = this.head.next
        if (!this.head) this.tail = null
        this._size--
      }
    } else {
      removed = prevNode.next
      if (removed) {
        prevNode.next = removed.next
        if (removed === this.tail) this.tail = prevNode
        this._size--
      }
    }
    this._checkInvariants()
    return removed || null
  }

  /**
   * Debug/dev: Check internal invariants of the list.
   * Throws if any invariant is violated.
   */
  private _checkInvariants(): void {
    if (!DEV_MODE) return
    // Check size matches node count
    let count = 0
    let cur = this.head
    let last: ListNode<T> | null = null
    const seen = new Set<ListNode<T>>()
    while (cur) {
      if (seen.has(cur)) throw new Error("LinkedList invariant failed: cycle detected")
      seen.add(cur)
      count++
      last = cur
      cur = cur.next
    }
    if (count !== this._size) throw new Error(`LinkedList invariant failed: _size=${this._size} but counted ${count}`)
    if (this._size === 0) {
      if (this.head !== null || this.tail !== null) throw new Error("LinkedList invariant failed: non-null head/tail for empty list")
    } else {
      if (!this.head) throw new Error("LinkedList invariant failed: null head for non-empty list")
      if (!this.tail) throw new Error("LinkedList invariant failed: null tail for non-empty list")
      if (last !== this.tail) throw new Error("LinkedList invariant failed: tail does not match last node")
      if (this.tail && this.tail.next !== null) throw new Error("LinkedList invariant failed: tail.next is not null")
    }
  }

  /**
   * Create a linked list.
   * - Pass an iterable to fill it with values.
   * - Pass a comparator to make it a "sorted list".
   */
  constructor(itemsOrComparator?: Iterable<T> | Comparator<T>, comparator?: Comparator<T>) {
    const items = typeof itemsOrComparator === "function" ? undefined : itemsOrComparator
    this.comparatorFn = typeof itemsOrComparator === "function"
      ? itemsOrComparator
      : comparator
    if (items) {
      for (const item of items) this.push(item)
    }
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
   *
   * Priority order is always defined by the canonical comparator (comparePriorityItem).
   * There is no manual stable insertion: all items are inserted in strict priority order.
   *
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
  *
 * Priority order is always defined by the canonical comparator (comparePriorityItem).
 * There is no manual stable insertion: all items are inserted in strict priority order.
 *
 * @returns A branded PriorityList
 * @example
 * const taskQueue = LinkedList.createPriorityList<Task>()
 * taskQueue.push({ name: 'urgent', priority: 10, sequence: 1 })
 * taskQueue.push({ name: 'normal', priority: 5, sequence: 2 })
 */
  public static createPriorityList<T extends PriorityItem>(): PriorityList<T> {
    const list = new LinkedList<T>(comparePriorityItem)
    Object.defineProperty(list, PRIORITY_LIST_BRAND, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    })
    return list as unknown as PriorityList<T>
  }

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
    this._insertNodeAtTail(node)
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
      throw new BaseError(
        "Cannot use unshift() on a sorted LinkedList",
        {
          code: "ERR_LINKED_LIST_UNSHIFT_SORTED",
          metadata: { method: "unshift" }
        }
      )
    }
    const node = new ListNode(value)
    this._insertNodeAtHead(node)
    return this
  }

  /**
   * Remove from the front.
   * @returns The removed value, or undefined if empty
   */
  public shift(): T | undefined {
    const removed = this._removeNode(null)
    return removed ? removed.value : undefined
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
      return !!this._removeNode(null)
    }
    let prev = this.head
    let cur = this.head.next
    while (cur) {
      if (cur.value === value) {
        return !!this._removeNode(prev)
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
   *
   * ⚠️ If the list is sorted (i.e., constructed with a comparator),
   * this method is allowed, but it does not re-balance or re-sort the list after removals.
   * Removing nodes in this way may create gaps that violate the expected sorted order.
   * Use with care if list order invariants are important.
   */
  public removeWhere(predicate: ValuePredicate<T>): number {
    let removed = 0
    let prev: ListNode<T> | null = null
    let cur = this.head
    while (cur) {
      if (predicate(cur.value)) {
        this._removeNode(prev)
        removed++
        cur = prev ? prev.next : this.head
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
      throw new BaseError(
        "insertAt() is not allowed on a sorted LinkedList",
        {
          code: "ERR_LINKED_LIST_INSERT_AT_SORTED",
          metadata: { method: "insertAt" }
        }
      )
    }
    if (index < 0 || index > this._size) return false
    const node = new ListNode(value)
    if (index === 0) {
      this._insertNodeAtHead(node)
      return true
    }
    if (index === this._size) {
      this._insertNodeAtTail(node)
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
    this._insertNodeAfter(prev, node)
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
      throw new BaseError(
        "No compareFn provided for sortedInsert; explicit comparator required for all types.",
        {
          code: "ERR_LINKED_LIST_NO_COMPARATOR",
          metadata: { method: "sortedInsert", value }
        }
      )
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


export function comparePriorityItem(a: PriorityItem, b: PriorityItem): number {
  if (a.priority !== b.priority) return b.priority - a.priority
  return a.sequence - b.sequence
}
