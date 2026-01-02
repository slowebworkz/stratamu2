import type { BaseErrorOptions } from "@/errors"
import { BaseError } from "@/errors"
import type { AllEventKeys } from "@/events"
import { makeReadonlySet } from "@/utils"
import type { BaseEventMap } from "@repo/types"

export class SeenEventRegistry<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap> = AllEventKeys<EventMap>,
> {
  /* ------------------- Private Storage ------------------- */

  /** Internal storage */
  private readonly seen = new Set<RegistryKey>()

  /** Cached readonly set for efficient repeated queries */
  private cached?: ReadonlySet<RegistryKey>

  /** Marks the cache as dirty when mutations occur */
  private dirty = false

  /* ------------------- Public Mutators ------------------- */

  /**
   * Add a new event to the registry.
   * Throws if the event is invalid (null/undefined).
   */
  public add(event: RegistryKey): void {
    // Defensive runtime guard: This should be impossible in TypeScript unless using `as any` or calling from JS.
    // Included for extra safety at runtime boundaries; not a normal execution path.
    if (event == null) {
      SeenEventRegistry.throwError("Cannot add null or undefined as a seen event", {
        code: "INVALID_EVENT_KEY",
        category: "usage",
        metadata: { event },
      })
    }

    this.mutateIf(!this.seen.has(event), () => this.seen.add(event))
  }

  /**
   * Remove a specific event from the registry.
   * Throws if the event was never added.
   */
  public remove(event: RegistryKey): void {
    if (!this.seen.has(event)) {
      SeenEventRegistry.throwError("Cannot remove unseen event", {
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
    this.mutateIf(this.seen.size > 0, () => this.seen.clear())
  }

  /* ------------------- Public Accessors ------------------- */

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

  /* ---------------- Private mutation helper ---------------- */

  private mutateIf(condition: boolean, mutate: () => void): void {
    if (!condition) return

    mutate()
    this.dirty = true
  }

  /* ---------------- Private static helpers ---------------- */

  /** Unified error throwing helper */
  private static throwError(
    message: string,
    options: BaseErrorOptions,
    event?: PropertyKey,
    listener?: unknown,
  ): never {
    const baseMetadata = { ...(options.metadata ?? {}) }
    if (event !== undefined && baseMetadata.event === undefined) {
      baseMetadata.event = String(event)
    }
    baseMetadata.listener =
      typeof listener === "function" ? listener.name || "[anonymous listener]" : String(listener)

    const errorOptions: BaseErrorOptions = {
      ...options,
      metadata: baseMetadata,
    }
    throw new BaseError(message, errorOptions)
  }
}
