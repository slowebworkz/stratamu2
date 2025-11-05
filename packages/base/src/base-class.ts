import type { BaseEventMap } from '@repo/types'
import { LoggedEmitter, INTERNAL_ON_CHILD_ERROR } from './events/index.js'

const ERROR_MSG = 'BaseClass cannot be instantiated directly'

/**
 * Abstract base class for event-driven classes.
 *
 * Provides structured logging, metrics, priority listeners,
 * safe emission, event bubbling, and lifecycle management.
 */
export abstract class BaseClass<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends LoggedEmitter<EventMap> {
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
      this.emit(INTERNAL_ON_CHILD_ERROR, [ERROR_MSG, { emitter: this }])
      this.log.error({ class: 'BaseClass', shouldThrow: true }, ERROR_MSG)
    }
  }
}
