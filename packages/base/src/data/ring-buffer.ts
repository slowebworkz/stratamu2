// RingBuffer.ts
import type { TypedArray } from 'type-fest'

// Defined helper types
type ArraySource<T> = ArrayLike<T> | TypedArray | Buffer
export class RingBuffer<T> {
  private buffer: (T | undefined)[]
  private start = 0
  private end = 0
  private _size = 0
  private readonly capacity: number

  constructor(capacity: number) {
    if (capacity <= 0) throw new Error('RingBuffer capacity must be > 0')
    this.capacity = capacity
    this.buffer = new Array(capacity)
  }

  push(item: T): void {
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
  pushMany(items: Iterable<T>): void {
    // Fast-path for arrays or array-like (TypedArray, Buffer, etc.): do block copies
    // to avoid repeated modulo math.
    if (Array.isArray(items) || isArrayLike(items)) {
      const isArr = Array.isArray(items)
      const n = isArr ? (items as T[]).length : (items as ArraySource<T>).length
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
      const newSize = Math.min(cap, this._size + n)
      if (this._size + n > cap) {
        const overflow = this._size + n - cap
        this.start = (this.start + overflow) % cap
      }
      this.end = newEnd
      this._size = newSize
      return
    }

    for (const it of items) this.push(it)
  }

  /** Remove and return the oldest item, or undefined if empty. */
  popOldest(): T | undefined {
    return ifEmptyReturn(this._size, () => {
      const val = this.buffer[this.start] as T
      this.buffer[this.start] = undefined
      this.start = (this.start + 1) % this.capacity
      this._size--
      this._ensureEndpoints()
      return val
    })
  }

  /** Remove and return the newest (most recent) item, or undefined if empty. */
  popNewest(): T | undefined {
    return ifEmptyReturn(this._size, () => {
      const idx = wrapIndex(this.end, -1, this.capacity)
      const val = this.buffer[idx] as T
      this.buffer[idx] = undefined
      this.end = idx % this.capacity
      this._size--
      this._ensureEndpoints()
      return val
    })
  }

  /** Drain up to `max` items (oldest first) and return them. If max is omitted, drain all. */
  drain(max?: number): T[] {
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

  toArray(): T[] {
    return readBufferRange(this.buffer, this.start, this._size, this.capacity)
  }

  /** Return the entries as JSON-friendly array (oldest -> newest). */
  toJSON(): T[] {
    return this.toArray()
  }

  /** Iterator: oldest -> newest */
  *[Symbol.iterator](): IterableIterator<T> {
    // Delegate to module-local helper to keep iteration logic DRY and testable.
    yield* bufferIterator(this.buffer, this.start, this._size, this.capacity)
  }

  /** Peek the oldest entry without removing it */
  peekOldest(): T | undefined {
    return ifEmptyReturn(this._size, () => this.buffer[this.start] as T)
  }

  /** Peek the newest (most recently pushed) entry without removing it */
  peekNewest(): T | undefined {
    return ifEmptyReturn(this._size, () => {
      const idx = wrapIndex(this.end, -1, this.capacity)
      return this.buffer[idx] as T
    })
  }

  clear(): void {
    this.start = 0
    this.end = 0
    this._size = 0
    this.buffer.fill(undefined)
  }

  get size(): number {
    return this._size
  }

  /** Return the configured capacity of the ring buffer */
  getCapacity(): number {
    return this.capacity
  }

  // Ensure end/start pointers are consistent when buffer is empty
  private _ensureEndpoints(): void {
    if (this._size === 0) this.end = this.start
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
): { end: number; start: number; size: number } {
  buffer[end] = item
  end = (end + 1) % capacity
  if (size < capacity) {
    size++
  } else {
    // Overwriting oldest, move start
    start = (start + 1) % capacity
  }
  return { end, start, size }
}

/** Helper: if size is zero return undefined else return the result of thunk */
function ifEmptyReturn<T>(size: number, thunk: () => T): T | undefined {
  return size === 0 ? undefined : thunk()
}

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
  destStart = normalizeIndex(destStart, capacity)
  const spaceAtEnd = capacity - destStart
  const first = Math.min(spaceAtEnd, len)
  const srcArr = src as ArrayLike<unknown>
  for (let i = 0; i < first; i++) {
    dest[destStart + i] = srcArr[srcStart + i] as unknown as T
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
  const a = v as any

  // Plain arrays
  if (Array.isArray(a)) return true

  // Node Buffer
  // Check for Buffer.isBuffer in environments that provide it.
  if (
    typeof Buffer !== 'undefined' &&
    typeof (Buffer as any).isBuffer === 'function' &&
    (Buffer as any).isBuffer(a)
  )
    return true

  // TypedArrays / DataView: ArrayBuffer.isView covers these
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(a)) return true

  // Fallback: generic array-like (has numeric length and isn't a function)
  return typeof a.length === 'number' && a.length >= 0 && !(a instanceof Function)
}

/** Write from an ArrayLike source into dest with wrapping. */
// ...existing code...

/**
 * Compute (end + delta) wrapped into [0, capacity).
 * Fast-paths for common small deltas are included (delta === -1 and in-range sums).
 */
function wrapIndex(end: number, delta: number, capacity: number): number {
  if (!Number.isFinite(end) || !Number.isFinite(delta) || !Number.isFinite(capacity))
    throw new TypeError('wrapIndex: invalid number')

  if (!Number.isInteger(capacity) || capacity <= 0)
    throw new TypeError('wrapIndex: capacity must be a positive integer')

  return (((end + delta) % capacity) + capacity) % capacity
}
