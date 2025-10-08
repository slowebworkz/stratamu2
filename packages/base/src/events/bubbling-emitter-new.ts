import type { BaseEventMap } from '@repo/types'
import type { Simplify } from 'type-fest'
import { MetricsEmitter } from './metrics-emitter.js'

export class BubblingEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
  ParentEventMap extends Simplify<
    BaseEventMap<unknown[]> & Record<keyof EventMap, unknown[]>
  > = EventMap,
> extends MetricsEmitter<EventMap> {
  /**
   * Optional parent emitter to which events may bubble.
   */
  protected parent?: BubblingEmitter<ParentEventMap>

  /**
   * Set of event names that should bubble to the parent.
   */
  private bubbleEvents = new Set<keyof EventMap>()

  /**
   * Construct a BubblingEmitter with an optional parent.
   * @param parent Optional parent emitter for bubbling.
   */
  constructor(parent?: BubblingEmitter<ParentEventMap>) {
    super()
    this.parent = parent
  }
}
