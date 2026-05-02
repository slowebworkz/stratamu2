import type { InternalEventKey, PublicEventName } from "./index.ts"
import type { BaseEventMap } from "@repo/types"

export type EventCollections<Map extends BaseEventMap> = {
  publicEvents: readonly PublicEventName<Map>[]
  internalEvents: readonly InternalEventKey[]
}
