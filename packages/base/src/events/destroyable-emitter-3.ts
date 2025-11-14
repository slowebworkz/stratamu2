import type { BaseEventMap } from '@repo/types'
import { BubblingEmitter } from './index.ts'

interface HasRemovePriorityListeners {
  removePriorityListeners(): void
}

interface HasRemoveAllListeners {
  removeAllListeners(): void
}

export class DestroyableEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
> extends BubblingEmitter<EventMap> {
  // /**
  //  * Remove all listeners (priority + normal), clear internal bookkeeping.
  //  */
  // public cleanupListeners(): void {
  //   // Remove priority listeners if supported
  //   if (hasRemovePriorityListeners(this)) {
  //     this.removePriorityListeners()
  //   }

  //   // Remove all regular listeners if supported
  //   if (hasAllListeners(this)) {
  //     this.removeAllListeners()
  //   }
  // }

  // /**
  //  * Unsubscribe from any priority listeners if present.
  //  */
  // public unsubscribeAll(): void {
  // }

  public destroy(): void {
    // this.unsubscribeAll()
    // this.removeAllListenersSafe()
    // this.dispose()
  }
}

// function objIsObject(obj: unknown): obj is Record<string, unknown> {
//   return isPlainObject(obj)
// }

// function hasRemovePriorityListeners(obj: unknown): obj is HasRemovePriorityListeners {
//   return (
//     objIsObject(obj) &&
//     typeof (obj as unknown as HasRemovePriorityListeners).removePriorityListeners === 'function'
//   )
// }

// function hasAllListeners(obj: unknown): obj is HasRemoveAllListeners {
//   return (
//     objIsObject(obj) &&
//     typeof (obj as unknown as HasRemoveAllListeners).removeAllListeners === 'function'
//   )
// }
