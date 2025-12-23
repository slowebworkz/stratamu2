import type { OmnipresentEventData } from "emittery"
import Emittery from "emittery"

import type {
  AllEventKeys,
  AllEvents,
  DisposerFn,
  PublicEventMap,
  SubscriptionOptions,
} from "@/events"
import { SafetyEmitter as SafetyManager } from "@/events"

import { ListenerRegistry } from "./listener-registry.ts"

import type { Awaitable, BaseEventMap, SingleArgListener } from "@repo/types"
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
    event: K | readonly K[],
    originalListener: SingleArgListener<EventMap, K>,
    options?: SubscriptionOptions,
  ): () => void {
    // 1️⃣ Handle array of events (recursively)
    if (Array.isArray(event)) {
      return SafeEmitter._handleMultipleEvents(event as readonly K[], originalListener, (ev, l) =>
        this.on(ev, l, options),
      )
    }

    // 2️⃣ Wrap the listener for error safety
    const wrappedListener = SafeEmitter._wrapListener<EventMap, K>(originalListener)

    // 3️⃣ Register the wrapped listener in the registry
    this._listenerRegistry.add(event as K, originalListener, wrappedListener)

    // // 3️⃣ Register the listener with Emittery, supporting AbortSignal
    // const off = this._public.on(event, wrappedListener, options)

    // // 4️⃣ Return disposer function
    // return () => {
    //   off()
    // }
  }

  public once<K extends AllEventKeys<EventMap>>(
    event: K,
    predicate?: (data: EventMap[K]) => boolean,
  ): OnceHandle<EventMap[K]> {
    let settled = false

    // Create an AbortController for cancellation
    const controller = new AbortController()
    const signal = controller.signal

    // Emittery's once promise (no AbortSignal support)
    const rawPromise = this._public.once(event, predicate)

    // Wrap the promise to handle CANCELLED
    const promise: Promise<OnceResult<EventMap[K]>> = rawPromise
      .then(data => data as OnceResult<EventMap[K]>)
      .catch(err => {
        if (signal.aborted) {
          return CANCELLED
        }
        throw err
      })
      .finally(() => {
        if (settled) return
        settled = true
        // Remove from registry if you have one
        // this._listenerRegistry?.removeOnce(event, rawPromise)
      })

    return {
      promise,
      cancel: () => {
        if (settled) return
        settled = true
        controller.abort() // triggers Emittery to remove the listener
        // this._listenerRegistry?.removeOnce(event, rawPromise)
      },
    }
  }

  public off<K extends AllEventKeys<EventMap>>(
    event: K,
    originalListener: SingleArgListener<EventMap, K>,
  ): void {
    // Look up the wrapped listener from the registry
    // const wrappedListener = this._listenerRegistry.get(event, originalListener)
    const wrappedListener = undefined // registry temporarily disabled

    if (!wrappedListener) {
      // Nothing to remove; Emittery will ignore anyway
      return
    }

    // Remove from Emittery
    this._public.off(event, wrappedListener)

    // Remove from registry
    // this._listenerRegistry.remove(event, originalListener)
  }

  public emit<K extends AllEventKeys<EventMap>>(
    event: K,
    data: (AllEvents<EventMap> & OmnipresentEventData)[K],
  ): Promise<void> {
    return this._public.emit(event, data)
  }

  /**
   * Emits an event serially using Emittery's emitSerial method.
   * Listeners are called one after another, waiting for each to complete.
   */
  public emitSerial<K extends AllEventKeys<EventMap>>(
    event: K,
    data: (AllEvents<EventMap> & OmnipresentEventData)[K],
  ): Promise<void> {
    return this._public.emitSerial(event, data)
  }

  /* ------------------- Protected: Errors ------------------- */

  /* ------------------- Static: Private utilities ------------------- */

  private static _handleMultipleEvents<
    EventMap extends BaseEventMap,
    K extends AllEventKeys<EventMap>,
  >(
    events: readonly K[],
    listener: SingleArgListener<EventMap, K>,
    getDisposer: (ev: K, l: typeof listener) => DisposerFn,
  ) {
    // 1️⃣ Collect disposers for each event
    const disposers = events
      .map(ev => getDisposer(ev, listener))
      .filter((d): d is DisposerFn => typeof d === "function")

    // 2️⃣ Return a single disposer
    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          void 0
        }
      }
    }
  }

  /**
   * Wraps a listener to provide centralized error handling and other housekeeping,
   * while preserving the listener's original type signature.
   */
  private static _wrapListener<EventMap extends BaseEventMap, K extends AllEventKeys<EventMap>>(
    originalListener: SingleArgListener<EventMap, K>,
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
