import type { BaseEventMap } from '@repo/types'
import Emittery from 'emittery'

export class Events<EventMap extends BaseEventMap = BaseEventMap> {
  // Static global/internal event bus (define event map later)
  static global = new Emittery()

  // Per-instance public event bus
  private readonly _public = new Emittery<EventMap>()

  /**
   * Register a listener for a public event.
   */
  on<K extends keyof EventMap & (string | symbol)>(
    event: K,
    listener: (data: EventMap[K]) => void,
  ) {
    return this._public.on(event, listener)
  }

  /**
   * Register a one-time listener for a public event.
   */
  once<K extends keyof EventMap & (string | symbol)>(
    event: K,
    listener: (data: EventMap[K]) => void,
  ) {
    return this._public.once(event).then(listener)
  }

  /**
   * Remove a listener for a public event.
   */
  off<K extends keyof EventMap & (string | symbol)>(
    event: K,
    listener: (data: EventMap[K]) => void,
  ) {
    return this._public.off(event, listener)
  }

  /**
   * Emit a public event.
   */
  emit<K extends keyof EventMap & (string | symbol)>(event: K, data: EventMap[K]) {
    return this._public.emit(event, data)
  }
}
