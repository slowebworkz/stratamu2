import type { BaseEventMap } from '@repo/types'
import { BubblingEmitter } from './bubbling-emitter.js'

/**
 * DestroyableEmitter extends BubblingEmitter to add lifecycle cleanup.
 *
 * - Provides a destroy() method to clean up listeners and parent references.
 * - Useful for objects that need explicit teardown (e.g., game entities, subsystems).
 *
 * @template EventMap - The event map for this emitter.
 */
export class DestroyableEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends BubblingEmitter<EventMap> {
  /**
   * Remove all listeners from this emitter.
   */
  unsubscribeAll(): void {
    super.clearListeners()
  }

  /**
   * Destroy this emitter, cleaning up listeners and parent references.
   * Calls logger.flush if available.
   */
  destroy(): void {
    this.dispose() // clears parent & bubbleEvents & listeners
    this.logger.flush?.()
  }
}
