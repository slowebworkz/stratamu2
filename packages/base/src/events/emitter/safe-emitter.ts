import type { OmnipresentEventData } from "emittery"
import Emittery from "emittery"

import type { AllEventKeys, AllEvents, PublicEventMap } from "@/events"
import { SafetyEmitter as SafetyManager } from "@/events"

import { ListenerRegistry } from "@/registry"

import type { Awaitable, BaseEventMap } from "@repo/types"
import type { Simplify, Tagged } from "type-fest"

declare const CancelledTag: unique symbol
export type Cancelled = Tagged<symbol, typeof CancelledTag>

export const CANCELLED = Symbol("SafeEmitter.once.cancelled") as Cancelled

type OnceResult<T> = T | Cancelled

type OnceHandle<T> = Simplify<{
  promise: Promise<OnceResult<T>>
  cancel(): void
}>

export abstract class SafeEmitter<EventMap extends BaseEventMap> {
  /* ------------------- Private Storage ------------------- */

  private readonly _listenerRegistry: ListenerRegistry<EventMap, unknown>

  private readonly _safety: SafetyManager<EventMap>

  /* ------------------- Protected ------------------- */

  protected readonly _public: Emittery<AllEvents<EventMap>>

  protected get _safetyManager(): SafetyManager<EventMap> {
    return this._safety
  }

  /* ------------------- Constructor ------------------- */

  constructor() {
    // Registry handles both public (string) and internal (symbol) events
    // Wrapped listeners are only used for public events (Emittery-compatible)
    this._listenerRegistry = new ListenerRegistry<EventMap, unknown>()

    // Compose the safety manager with hardcoded presets (no user config)
    const safetyManagerBus = new Emittery<PublicEventMap<EventMap>>()

    this._safety = new SafetyManager<EventMap>(safetyManagerBus, {
      sanitizeErrors: true,
      safetyLogCap: 100,
    })

    this._public = new Emittery<AllEvents<EventMap>>()
  }

  /* ------------------- Public API: Listeners ------------------- */

  public on<K extends AllEventKeys<EventMap>>(
    event: K,
    originalListener: (data: EventMap[K]) => Awaitable<void>,
  ): () => void {
    // Wrap the listener
    const wrappedListener = SafeEmitter._wrapListener<EventMap, K>(originalListener)

    // For now, pass the listener directly to Emittery
    // (later this can be adapted via adaptListenerForRegistry)
    const off = this._public.on(event, wrappedListener)

    return () => {
      off()
    }
  }

  // public once<K extends AllEventKeys<EventMap>>(
  //   event: K,
  //   predicate?: (data: EventMap[K]) => boolean
  // ): OnceHandle<EventMap[K]> {
  //   const raw = this._public.once(event, predicate)

  //   // this._listenerRegistry.addOnce(event, raw)

  //   let settled = false

  //   raw
  //     .then(data => {
  //       settled = true
  //       // this._listenerRegistry.removeOnce(event, raw)
  //       return data
  //     })
  //     .catch(err => {
  //       settled = true
  //       // this._listenerRegistry.removeOnce(event, raw)
  //       // this._safetyManager.handleError(err)
  //     })

  //   return {
  //     promise: raw.then(data => data),
  //     cancel: () => {
  //       if (settled) return
  //       settled = true
  //       raw.off()
  //       // this._listenerRegistry.removeOnce(event, raw)
  //     },
  //   }
  // }

  public once<K extends AllEventKeys<EventMap>>(
    event: K,
    predicate?: (data: EventMap[K]) => boolean,
  ): OnceHandle<EventMap[K]> {
    let settled = false

    // Emittery's once promise
    const raw = this._public.once(event, predicate)

    // this._listenerRegistry.addOnce(event, raw)

    // Cancellation promise
    let cancel!: () => void
    const cancelPromise = new Promise<typeof CANCELLED>(resolve => {
      cancel = () => resolve(CANCELLED)
    })

    const promise: Promise<OnceResult<EventMap[K]>> = Promise.race([
      raw.then(data => data as OnceResult<EventMap[K]>),
      cancelPromise,
    ]).finally(() => {
      if (settled) return
      settled = true

      // Ensure listener is removed
      raw.off()

      // this._listenerRegistry.removeOnce(event, raw)
    })

    return {
      promise,
      cancel: () => {
        if (settled) return
        cancel()
      },
    }
  }

  public off<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: (data: EventMap[K]) => Awaitable<void>,
  ): void {
    this._public.off(event, listener)
  }

  public emit<K extends AllEventKeys<EventMap>>(
    event: K,
    data: (AllEvents<EventMap> & OmnipresentEventData)[K],
  ): Promise<void> {
    return this._public.emit(event, data)
  }

  /* ------------------- Static: Private utilities ------------------- */

  /**
   * Wraps a listener to provide centralized error handling and other housekeeping,
   * while preserving the listener's original type signature.
   */
  private static _wrapListener<EventMap extends BaseEventMap, K extends AllEventKeys<EventMap>>(
    originalListener: (data: EventMap[K]) => Awaitable<void>,
  ): (data: EventMap[K]) => Awaitable<void> {
    const wrapped: (data: EventMap[K]) => Awaitable<void> = async data => {
      try {
        await originalListener(data)
      } catch (err) {
        // handleError(err, data)
      }
    }

    return wrapped
  }
}
