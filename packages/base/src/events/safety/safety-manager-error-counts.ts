import { BaseError } from "@/errors"
import { sumMapValues } from "@/events"
import { makeReadonlyMap } from "@/utils"
import type { BaseEventMap, EventKey } from "@repo/types"

export class SafetyManagerErrorCounts<
  EventMap extends BaseEventMap,
  SafetyKey extends EventKey<EventMap> = EventKey<EventMap>,
> {
  /* ------------------- Private Storage ------------------- */

  private readonly _counts = new Map<SafetyKey, number>()
  private readonly _readonlyCounts: ReadonlyMap<SafetyKey, number>

  /* --------------------- Constructor --------------------- */

  constructor() {
    this._readonlyCounts = makeReadonlyMap(this._counts)
  }

  /* ---------------------- Public API --------------------- */

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
  public get(key?: SafetyKey): number {
    if (key === undefined) return sumMapValues(this._counts)
    return this._counts.get(key) ?? 0
  }

  public getAll(): ReadonlyMap<SafetyKey, number> {
    return this._readonlyCounts
  }

  /** Dev-only assertion for invalid keys; production returns false for nullish keys to avoid throw. */
  public has(key: SafetyKey): boolean {
    if (key == null) {
      const err = "Safety key cannot be null or undefined"
      SafetyManagerErrorCounts.fail(err)
    }
    return this._counts.has(key)
  }

  public clear(): void {
    this._counts.clear()
  }

  public reset(key?: SafetyKey): void {
    if (key === undefined) {
      this._counts.clear()
      return
    }

    if (key == null) SafetyManagerErrorCounts.fail("Safety key cannot be null or undefined")
    this._counts.delete(key)
  }

  public toJSON(): Record<string, number> {
    return Object.fromEntries(this._counts)
  }

  /* -------------------- Private Helpers -------------------- */

  private static fail(message: string, metadata?: Record<string, unknown>): never {
    throw new BaseError(message, { metadata })
  }
}
