import type { AllEvents } from "@/events"
import { FilteredPriorityEmitter } from "@/events"
import { BaseError } from "@/errors"
import type { Args, BaseEventMap } from "@repo/types"

/**
 * BubblingEmitter: An event emitter that can bubble events up to a parent emitter.
 * Extends FilteredPriorityEmitter to provide hierarchical event propagation.
 *
 * @template EventMap - The event map defining event names and their data types
 * @template ParentEventMap - The parent's event map (defaults to AllEvents<EventMap>)
 */
export abstract class BubblingEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
  ParentEventMap extends AllEvents<EventMap> = AllEvents<EventMap>,
> extends FilteredPriorityEmitter<EventMap> {
  // Empty scaffold - ready for implementation
}
