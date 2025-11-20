import type { BaseEventMap } from "@repo/types"
import { BubblingEmitter } from "./bubbling-emitter.js"

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
    // Also clear priority listeners if this emitter has them
    if (hasClearPriorityListeners(this)) {
      this.clearPriorityListeners()
    }
    // Type guard for objects with clearPriorityListeners method
    function hasClearPriorityListeners(
      obj: unknown,
    ): obj is { clearPriorityListeners: () => void } {
      return (
        typeof obj === "object" &&
        obj !== null &&
        typeof (obj as { clearPriorityListeners?: unknown }).clearPriorityListeners === "function"
      )
    }
  }

  /**
   * Destroy this emitter, cleaning up listeners and parent references.
   * Calls logger.flush if available.
   */
  destroy(): void {
    try {
      this.dispose() // clears parent & bubbleEvents & listeners
    } catch {
      // Ignore dispose errors during destruction
    }

    try {
      this.logger.flush?.()
    } catch {
      // Ignore logger flush errors during destruction
    }
  }
}
