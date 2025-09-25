import { DestroyableEmitter } from '@/events'
import type { BaseEventMap } from '@repo/types'

const ERROR_MSG = 'BaseClass cannot be instantiated directly'

/**
 * Abstract base class for event-driven classes.
 *
 * Provides structured logging, metrics, priority listeners,
 * safe emission, event bubbling, and lifecycle management.
 */
export abstract class BaseClass<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends DestroyableEmitter<EventMap> {
  constructor(...args: any[]) {
    super(...args)
    if (new.target === BaseClass) {
      this.log.error({ class: 'BaseClass', shouldThrow: true }, ERROR_MSG)
    }
  }
}
