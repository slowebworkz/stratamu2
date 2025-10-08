import type { BaseEventMap } from '@repo/types'
import { LoggedEmitter } from './events/logged-emitter-3.js'
import { INTERNAL_ON_CHILD_ERROR } from './events/private-events.js'

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

    if (new.target === BaseClass) {
      // Emit internal error event for direct instantiation
      this.emit(INTERNAL_ON_CHILD_ERROR, ...([ERROR_MSG, { emitter: this }] as any))
      // this.log.error({ class: 'BaseClass', shouldThrow: true }, ERROR_MSG)
    }
  }
}
