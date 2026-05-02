import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { AllEventKeys, SubscriptionOptions } from "../types/index.ts"
import type { Simplify } from "type-fest"

type OnErrorFn = (error: unknown, caption: string) => void

type OnRemoveFn<Map extends BaseEventMap, ListenerKey extends AllEventKeys<Map>> = (
  listener: SingleArgListener<Map, ListenerKey>,
) => void

export type ListenerWrapperOptions<
  Map extends BaseEventMap,
  ListenerKey extends AllEventKeys<Map>,
> = Simplify<
  SubscriptionOptions & {
    onError: OnErrorFn
    onRemove?: OnRemoveFn<Map, ListenerKey>
  }
>

export type ListenerKeys<Map extends BaseEventMap> = Extract<AllEventKeys<Map>, string>
