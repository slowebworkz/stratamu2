import type { BaseEventMap } from '@repo/types'
import { BubblingEmitter } from '@/events'
import { BaseError } from '@/errors'

const ERROR_MSG = 'BaseClass cannot be instantiated directly'

/**
 * Abstract base class for event-driven classes.
 *
 * Provides structured logging, metrics, priority listeners,
 * safe emission, event bubbling, and lifecycle management.
 */
export abstract class BaseClass<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends BubblingEmitter<EventMap> {
  constructor() {
    super()
    this.ensureNotInstantiatedDirectly(new.target)
  }

  /**
   * Throws or emits an error if this abstract base class is instantiated directly.
   * Subclasses can override or extend this for custom instantiation guards.
   */
  protected ensureNotInstantiatedDirectly(target: unknown): void {
    if (target === BaseClass) {
      this.log.error({ class: 'BaseClass', shouldThrow: true }, ERROR_MSG)
      throw new BaseError(ERROR_MSG)
    }
  }
}
