import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { AllEventKeys } from "@repo/events"

/**
 * Cache for original listeners per event.
 * Event-aware and readonly by construction.
 */
export class ListenerKeysCache<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap> = AllEventKeys<EventMap>,
> {
  /* -------------- 🔒 Private Storage ----------------------- */

  private cache = new Map<RegistryKey, ReadonlyArray<SingleArgListener<EventMap, RegistryKey>>>()

  /* -------------- 📤 Public Accessors/Mutators ------------- */

  public getOrCompute(
    event: RegistryKey,
    compute: () => Array<SingleArgListener<EventMap, RegistryKey>>,
  ): ReadonlyArray<SingleArgListener<EventMap, RegistryKey>> {
    const existing = this.cache.get(event)
    if (existing) return existing

    const value = compute()
    const frozen =
      value.length === 0
        ? (ListenerKeysCache.EMPTY_ARRAY as ReadonlyArray<SingleArgListener<EventMap, RegistryKey>>)
        : Object.freeze(value.slice())

    this.cache.set(event, frozen)
    return frozen
  }

  public get(
    event: RegistryKey,
  ): ReadonlyArray<SingleArgListener<EventMap, RegistryKey>> | undefined {
    return this.cache.get(event)
  }

  public invalidate(event: RegistryKey): void {
    this.cache.delete(event)
  }

  public clear(): void {
    this.cache.clear()
  }

  /* -------------- 🗂️ Static/Shared Constants -------------- */

  /** Shared empty array to avoid repeated allocations for empty results */
  private static readonly EMPTY_ARRAY: ReadonlyArray<never> = []
}
