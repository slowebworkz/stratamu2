import type { BaseEventMap, EventKey } from "@repo/types"
import { BaseError, makeReadonlyMap } from "@repo/base"

export class SafetyManagerErrorCounts<
  EventMap extends BaseEventMap,
  SafetyKey extends EventKey<EventMap> = EventKey<EventMap>,
> {
  /* -------------- 🔒 Private Storage ----------------------- */

  private readonly _counts = new Map<SafetyKey, number>()
  private readonly _readonlyCounts!: ReadonlyMap<SafetyKey, number>

  /* -------------- 🔨 Constructor -------------------------- */

  constructor() {
    this._readonlyCounts = makeReadonlyMap<SafetyKey, number>(this._counts)
  }

  /* -------------- 📤 Public API --------------------------- */

  /**
   * Returns the count for a key; when called with no key, returns the total across all keys.
   */
  public increment(key: SafetyKey, delta = 1): number {
    if (!Number.isFinite(delta)) {
      SafetyManagerErrorCounts.fail("Invalid increment delta", { delta })
    }

    const prev = this._counts.get(key) ?? 0
    const next = prev + delta
    if (next < 0) {
      SafetyManagerErrorCounts.fail("Error count cannot be negative", {
        key,
        delta,
        previous: prev,
      })
    }
    this._counts.set(key, next)
    return next
  }

  /**
   * When `key` is omitted, returns the total sum of all counts; otherwise returns the per-key count.
   */
  public get(): number
  public get(key: SafetyKey): number
  public get(key?: SafetyKey): number {
    if (key === undefined) return SafetyManagerErrorCounts.sumMapValues(this._counts)
    return this._counts.get(key) ?? 0
  }

  public getAll(): ReadonlyMap<SafetyKey, number> {
    return this._readonlyCounts
  }

  /** Throws if key is null or undefined; always asserts key validity at runtime. */
  public has(key: SafetyKey | null | undefined): boolean {
    if (key == null) SafetyManagerErrorCounts.fail("Safety key cannot be null or undefined")
    return this._counts.has(key)
  }

  public clear(): void {
    this._counts.clear()
  }

  public reset(key?: SafetyKey): void {
    if (key === undefined) return this.clear()
    this._counts.delete(key)
  }

  /**
   * Returns a plain object of string keys to counts, for JSON serialization.
   * Symbol keys are omitted.
   */
  public toJSON(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [k, v] of this._counts) {
      if (typeof k === "string") out[k] = v
    }
    return out
  }

  /**
   * Returns a new Map of all keys (string and symbol) to their counts.
   */
  public toMap(): ReadonlyMap<SafetyKey, number> {
    return new Map(this._counts)
  }
  /* -------------- 🔧 Static: Private utilities ------------ */

  private static fail(message: string, metadata?: Record<string, unknown>): never {
    throw new BaseError(message, { metadata })
  }

  private static sumMapValues<K>(m: ReadonlyMap<K, number>): number {
    let total = 0
    for (const v of m.values()) total += v
    return total
  }
}
