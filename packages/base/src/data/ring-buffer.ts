import { BaseError, DomainError } from "../errors"
import { isFiniteNumber, whenNotEmpty } from "../utils"
import { isObject } from "../utils"
import type { TypedArray } from "type-fest"

export type ArraySource<T> =
  | ArrayLike<T>
  | (TypedArray & ArrayLike<T>)
  | (T extends number ? Buffer : never)

export class RingBuffer<T> {
  private buffer: (T | undefined)[]
  private start = 0
  private end = 0
  private _size = 0
  private readonly capacity: number

  constructor(capacity: number) {
    if (capacity <= 0) throw new BaseError("RingBuffer capacity must be > 0")
    this.capacity = capacity
    this.buffer = new Array(capacity)
  }

  public push(item: T): void {
    const { end, start, size } = ringBufferPush(
      this.buffer,
      this.end,
      this.start,
      this._size,
      this.capacity,
      item,
    )
    this.end = end
    this.start = start
    this._size = size
  }

  /**
   * Push multiple items in order. Equivalent to calling push for each
   * item but slightly more convenient for callers.
   */
  public pushMany(items: ArraySource<T>): void
  public pushMany(items: Iterable<T>): void
  public pushMany(items: Iterable<T> | ArraySource<T>): void {
    if (isArrayLike(items)) {
      const n = (items as ArraySource<T>).length
      if (n === 0) return
      const cap = this.capacity
      if (n >= cap) {
        // Keep only the last `cap` items and write them starting at index 0
        const startIdx = n - cap
        writeWrapped(this.buffer, 0, items as ArraySource<T>, startIdx, cap, cap)
        this.start = 0
        this._size = cap
        // next write index = (start + size) % cap — compute explicitly for clarity
        this.end = (this.start + this._size) % cap
        return
      }

      // n < cap: write items starting at `end` with a wrapped copy helper
      writeWrapped(this.buffer, this.end, items as ArraySource<T>, 0, n, cap)
      const newEnd = wrapIndex(this.end, n, cap)
      const total = this._size + n
      const newSize = Math.min(cap, total)
      if (total > cap) {
        this.start = (this.start + (total - cap)) % cap
      }
      this.end = newEnd
      this._size = newSize
      return
    }

    for (const it of items) this.push(it)
  }

  // Remove and return the oldest item, or undefined if empty.
  public popOldest(): T | undefined {
    return whenNotEmpty(this._size, () => {
      const val = this.buffer[this.start] as T
      this.buffer[this.start] = undefined
      this.start = (this.start + 1) % this.capacity
      this._size--
      if (this._size === 0) this.end = this.start
      return val
    })
  }

  // Remove and return the newest (most recent) item, or undefined if empty.
  public popNewest(): T | undefined {
    return whenNotEmpty(this._size, () => {
      const idx = wrapIndex(this.end, -1, this.capacity)
      const val = this.buffer[idx] as T
      this.buffer[idx] = undefined
      this.end = idx
      this._size--
      if (this._size === 0) this.end = this.start
      return val
    })
  }

  // Drain up to `max` items (oldest first) and return them. If max is omitted, drain all.
  public drain(max?: number): T[] {
    const toTake =
      max === undefined ? this._size : Math.min(this._size, Math.max(0, Math.floor(max)))
    if (toTake === 0) return []
    const out = new Array<T>(toTake)

    // If the range is contiguous (no wrap), copy in one block; otherwise copy two blocks.
    const cap = this.capacity
    const first = Math.min(toTake, cap - this.start)
    // copy first block
    for (let i = 0; i < first; i++) {
      out[i] = this.buffer[this.start + i] as T
      this.buffer[this.start + i] = undefined
    }
    // copy second block if needed
    if (toTake > first) {
      const second = toTake - first
      for (let i = 0; i < second; i++) {
        out[first + i] = this.buffer[i] as T
        this.buffer[i] = undefined
      }
    }

    // advance pointers
    this.start = (this.start + toTake) % cap
    this._size -= toTake
    this._ensureEndpoints()
    return out
  }

  /**
   * Returns the buffer contents as an array (oldest -> newest).
   * Note: This yields direct references to buffer entries. If the buffer holds objects,
   * consumers can mutate them. For safety-critical or immutable use, see toReadonlyArray().
   */
  public toArray(): T[] {
    return readBufferRange(this.buffer, this.start, this._size, this.capacity)
  }

  /**
   * Returns a defensive copy of the buffer contents (oldest -> newest).
   * For objects, this uses structuredClone if available, otherwise a shallow copy for plain objects/arrays.
   * Use this for safety-critical or immutable consumers.
   *
   * Note: Only plain objects and arrays are shallow-copied. Other types are returned as-is.
   */
  public toReadonlyArray(): T[] {
    const arr = this.toArray()
    if (typeof structuredClone === "function") {
      return arr.map(item => structuredClone(item) as T)
    }
    return arr.map(item => {
      if (Array.isArray(item)) return [...item] as T
      if (item && isObject(item) && Object.getPrototypeOf(item) === Object.prototype)
        return { ...item } as T
      return item
    })
  }

  /** Return the entries as JSON-friendly array (oldest -> newest). */
  public toJSON(): T[] {
    return this.toArray()
  }

  /** Iterator: oldest -> newest */
  public *[Symbol.iterator](): IterableIterator<T> {
    // Delegate to module-local helper to keep iteration logic DRY and testable.
    yield* bufferIterator(this.buffer, this.start, this._size, this.capacity)
  }

  /** Peek the oldest entry without removing it */
  public peekOldest(): T | undefined {
    return whenNotEmpty(this._size, () => this.buffer[this.start] as T)
  }

  /** Peek the newest (most recently pushed) entry without removing it */
  public peekNewest(): T | undefined {
    return whenNotEmpty(this._size, () => {
      const idx = wrapIndex(this.end, -1, this.capacity)
      return this.buffer[idx] as T
    })
  }

  /** Peek at the entry at the given offset from the oldest (0 = oldest, size-1 = newest). */
  public peekAt(offset: number): T | undefined {
    if (offset < 0 || offset >= this._size) return undefined
    return this.buffer[(this.start + offset) % this.capacity] as T
  }

  public clear(): void {
    this.start = 0
    this.end = 0
    this._size = 0
    this.buffer.fill(undefined)
  }

  public get size(): number {
    return this._size
  }

  /** Return the configured capacity of the ring buffer */
  public getCapacity(): number {
    return this.capacity
  }

  public get isEmpty(): boolean {
    return this._size === 0
  }

  public get isFull(): boolean {
    return this._size === this.capacity
  }

  // Ensure end/start pointers are consistent when buffer is empty
  private _ensureEndpoints(): void {
    if (this._size === 0) this.end = this.start
  }

  /** Return the remaining capacity (number of items that can be added before full). */
  public get remainingCapacity(): number {
    return this.capacity - this._size
  }
}

/** Module-local helper that performs the push semantics for a ring buffer.
 * Returns updated { end, start, size }.
 */
function ringBufferPush<T>(
  buffer: (T | undefined)[],
  end: number,
  start: number,
  size: number,
  capacity: number,
  item: T,
): Record<"end" | "start" | "size", number> {
  buffer[end] = item
  const next = end + 1
  const newEnd = next === capacity ? 0 : next
  let newStart = start
  let newSize = size
  if (size < capacity) {
    newSize++
  } else {
    // Overwriting oldest, move start
    newStart = (start + 1) % capacity
  }
  return { end: newEnd, start: newStart, size: newSize }
}

// whenNotEmpty moved to utils/if-empty-return

/** Normalize an index into [0, capacity). */
function normalizeIndex(idx: number, capacity: number): number {
  return ((idx % capacity) + capacity) % capacity
}

/** Write `len` items from an ArrayLike `src` starting at `srcStart` into `dest` starting at `destStart`, wrapping inside dest if needed. */
function writeWrapped<T>(
  dest: (T | undefined)[],
  destStart: number,
  src: ArraySource<unknown>,
  srcStart: number,
  len: number,
  capacity: number,
): void {
  if (len <= 0) return
  const srcArr = src as ArrayLike<unknown>
  // Micro-optimization: if writing a full layer, do a single fast loop
  if (len === capacity) {
    for (let i = 0; i < capacity; i++) {
      dest[i] = srcArr[srcStart + i] as unknown as T
    }
    return
  }
  const normDestStart = normalizeIndex(destStart, capacity)
  const spaceAtEnd = capacity - normDestStart
  const first = Math.min(spaceAtEnd, len)
  for (let i = 0; i < first; i++) {
    dest[normDestStart + i] = srcArr[srcStart + i] as unknown as T
  }
  if (len > first) {
    const second = len - first
    for (let i = 0; i < second; i++) {
      dest[i] = srcArr[srcStart + first + i] as unknown as T
    }
  }
}

/** Read a contiguous range from the ring buffer (oldest->newest) as an array. */
function readBufferRange<T>(
  buffer: (T | undefined)[],
  start: number,
  size: number,
  capacity: number,
): T[] {
  const out = new Array<T>(size)
  if (size === 0) return out
  const first = Math.min(size, capacity - start)
  for (let i = 0; i < first; i++) out[i] = buffer[start + i] as T
  if (size > first) {
    const second = size - first
    for (let i = 0; i < second; i++) out[first + i] = buffer[i] as T
  }
  return out
}

/** Generator helper: yields buffer entries oldest->newest without allocating. */
function* bufferIterator<T>(
  buffer: (T | undefined)[],
  start: number,
  size: number,
  capacity: number,
): IterableIterator<T> {
  if (size === 0) return
  const first = Math.min(size, capacity - start)
  for (let i = 0; i < first; i++) yield buffer[start + i] as T
  if (size > first) {
    const second = size - first
    for (let i = 0; i < second; i++) yield buffer[i] as T
  }
}

/**
 * Simple runtime check for array-like sources.
 *
 * This recognizes plain arrays, Array-like objects (has numeric `length`),
 * TypedArrays (Uint8Array, Float32Array, etc.) and Node Buffers.
 */
function isArrayLike<T>(v: unknown): v is ArrayLike<T> | TypedArray | Buffer {
  if (v == null) return false
  if (typeof v === "string") return false
  const a = v as { length?: unknown }

  // Plain arrays
  if (Array.isArray(a)) return true

  // Node Buffer
  // Check for Buffer.isBuffer in environments that provide it.
  const maybeBuffer = Buffer as unknown as { isBuffer?: (obj: unknown) => boolean }
  if (
    typeof Buffer !== "undefined" &&
    typeof maybeBuffer.isBuffer === "function" &&
    maybeBuffer.isBuffer(a)
  )
    return true

  // TypedArrays / DataView: ArrayBuffer.isView covers these
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(a)) return true

  // Fallback: generic array-like (has numeric length and isn't a function)
  return (
    Number.isSafeInteger((a as { length?: unknown }).length) &&
    (a as { length: number }).length >= 0 &&
    typeof a !== "function"
  )
}

/**
 * Compute (end + delta) wrapped into [0, capacity).
 * Fast-paths for common small deltas are included (delta === -1 and in-range sums).
 */
function wrapIndex(end: number, delta: number, capacity: number): number {
  if ([end, delta, capacity].some(n => !isFiniteNumber(n)))
    throw new DomainError("wrapIndex: invalid number")
  if (!Number.isInteger(capacity) || capacity <= 0)
    throw new DomainError("wrapIndex: capacity must be a positive integer")
  return normalizeIndex(end + delta, capacity)
}
