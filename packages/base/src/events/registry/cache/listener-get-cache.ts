import type { AllEventKeys } from "@/events"
import type { PerEventCache } from "@/registry"
import type { BaseEventMap, SingleArgListener } from "@repo/types"

export class ListenerGetCache<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap>,
> {
  /* ------------------- Private Storage ------------------- */

  private cache!: WeakMap<
    SingleArgListener<EventMap, RegistryKey>,
    PerEventCache<EventMap, SingleArgListener<EventMap, RegistryKey>>
  >

  /* -------------------- Constructor  --------------------- */

  constructor() {
    this.clearAll()
  }

  /* ------------------ Public accessors  ------------------ */

  public get(
    listener: SingleArgListener<EventMap, RegistryKey>,
    event: RegistryKey,
  ): SingleArgListener<EventMap, RegistryKey> | undefined {
    return this.cache.get(listener)?.get(event)
  }

  public getOrCreateEventMap(
    listener: SingleArgListener<EventMap, RegistryKey>,
  ): PerEventCache<EventMap, SingleArgListener<EventMap, RegistryKey>> {
    let map = this.cache.get(listener)
    if (!map) {
      map = new Map<RegistryKey, SingleArgListener<EventMap, RegistryKey>>()
      this.cache.set(listener, map)
    }
    return map
  }

  public memoize(
    listener: SingleArgListener<EventMap, RegistryKey>,
    event: RegistryKey,
    compute: () => SingleArgListener<EventMap, RegistryKey> | undefined,
  ): SingleArgListener<EventMap, RegistryKey> | undefined {
    const map = this.getOrCreateEventMap(listener)

    if (map.has(event)) {
      return map.get(event)
    }

    const value = compute()
    if (value !== undefined) {
      map.set(event, value)
    }

    return value
  }

  clearAll(): void {
    this.cache = new WeakMap<
      SingleArgListener<EventMap, RegistryKey>,
      PerEventCache<EventMap, SingleArgListener<EventMap, RegistryKey>>
    >()
  }
}
