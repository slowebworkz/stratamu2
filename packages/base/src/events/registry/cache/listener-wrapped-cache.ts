import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { AllEventKeys } from "@/events"
import { CacheBase } from "./cache-base.ts"

/** Cache for wrapped listeners */
export class ListenerWrappedCache<
  EventMap extends BaseEventMap,
  RegistryKey extends AllEventKeys<EventMap>,
> extends CacheBase<RegistryKey, SingleArgListener<EventMap, RegistryKey>> {}
