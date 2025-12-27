import { BaseError } from "@/errors"
import type { AllEventKeys } from "@/events"
import { makeReadonlySet } from "@/utils"
import type { BaseEventMap } from "@repo/types"

/**
 * Registry for tracking events that have been observed/emitted.
 * Provides cached read-only access and optional runtime validation.
 */
export class SeenEventRegistry<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap> = AllEventKeys<EventMap>,
> {
  /** Internal storage of seen events */
  private readonly seen = new Set<RegistryKey>()

  /** Cached readonly set for efficient repeated queries */
  private cached?: ReadonlySet<RegistryKey>

  /** Marks the cache as dirty when mutations occur */
  private dirty = false

  /**
   * Add a new event to the registry.
   * Throws if the event is invalid (null/undefined).
   */
  public add(event: RegistryKey): void {
    if (event == null) {
      throw new BaseError("Cannot add null or undefined as a seen event", {
        code: "INVALID_EVENT_KEY",
        category: "usage",
        metadata: { event },
      })
    }

    if (!this.seen.has(event)) {
      this.seen.add(event)
      this.dirty = true
    }
  }

  /** Check if an event has been seen */
  public has(event: RegistryKey): boolean {
    return this.seen.has(event)
  }

  /**
   * Retrieve all seen events as a cached, read-only set.
   * Cache is automatically refreshed on mutations.
   */
  public getAll(): ReadonlySet<RegistryKey> {
    if (!this.cached || this.dirty) {
      this.cached = makeReadonlySet(this.seen)
      this.dirty = false
    }
    return this.cached
  }

  /**
   * Remove a specific event from the registry.
   * Throws if the event was never added.
   */
  public remove(event: RegistryKey): void {
    if (!this.seen.has(event)) {
      throw new BaseError("Cannot remove unseen event", {
        code: "EVENT_NOT_FOUND",
        category: "usage",
        metadata: { event },
      })
    }

    this.seen.delete(event)
    this.dirty = true
  }

  /** Clear all seen events */
  public clear(): void {
    if (this.seen.size > 0) {
      this.seen.clear()
      this.dirty = true
    }
  }
}
