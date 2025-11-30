import { BubblingEmitter } from "@/events"
import type { BaseEventMap } from "@repo/types"

const ERROR_MSG = "BaseClass cannot be instantiated directly"

/**
 * @abstract
 * Abstract base class for event-driven classes.
 *
 * Provides structured logging, metrics, priority listeners,
 * safe emission, event bubbling, and lifecycle management.
 */
export abstract class BaseClass<
  EventMap extends BaseEventMap = BaseEventMap,
> extends BubblingEmitter<EventMap> {
  constructor() {
    super()
    BaseClass.ensureNotInstantiatedDirectly(new.target)
  }

  /**
   * Throws or emits an error if this abstract base class is instantiated directly.
   * Subclasses can override or extend this for custom instantiation guards.
   */
  protected static ensureNotInstantiatedDirectly(target: unknown): void {
    if (target === BaseClass) {
      BaseClass.prototype.log?.error?.({ class: BaseClass.name, shouldThrow: true }, ERROR_MSG)
    }
  }
}
