import type { OmnipresentEventData } from "emittery"
import Emittery from "emittery"

import { DEV_MODE } from "@/env"

import type { BaseError, ErrorCauseType } from "@/errors"
import { ListenerError } from "@/errors"

import type {
  AllEventKeys,
  AllEvents,
  CancelablePromise,
  DisposerFn,
  EmitArgs,
  InternalEventMap,
  PublicEventMap,
  SubscriptionOptions,
  Tuplefy,
  WrappedCancelable,
  WrappedListener,
} from "@/events"
import {
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_REMOVE_WARN,
  SafetyEmitter as SafetyManager,
  emitteryArgToTuple,
  internalPublicBus,
  isInternalEvent,
  isPublicEvent,
  adaptListenerForRegistry,
  tupleToEmitteryArg,
  wrapCancelablePromise,
  convertToEmitteryListener,
} from "@/events"
import { ListenerRegistry } from "@/registry"

import { emitWithErrorHandling, safeCall } from "@/utils"

import type {
  AnyListenerFn,
  Awaitable,
  BaseEventMap,
  EventKey,
  ListenerErrorContext,
  ListenerFn,
} from "@repo/types"
import { KeyAsString } from "type-fest"

export abstract class SafeEmitter<EventMap extends BaseEventMap> {
  /* ------------------- Private Storage ------------------- */

  private readonly _listenerRegistry: ListenerRegistry<
    EventMap,
    WrappedListener<EventMap, Extract<AllEventKeys<EventMap>, string>>
  >

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
    this._listenerRegistry = new ListenerRegistry<
      EventMap,
      WrappedListener<EventMap, Extract<AllEventKeys<EventMap>, string>>
    >()

    // Internal events use standard listeners (no wrapping needed)
    // this._listenerRegistry = new ListenerRegistry<EventMap>()

    // Compose the safety manager with hardcoded presets (no user config)
    const safetyManagerBus = new Emittery<PublicEventMap<EventMap>>()

    this._safety = new SafetyManager<EventMap>(safetyManagerBus, {
      sanitizeErrors: true,
      safetyLogCap: 100,
    })

    this._public = new Emittery<AllEvents<EventMap>>()
  }

  // /* ------------------- Private instance fields ------------------- */

  // private readonly _listenerRegistry: ListenerRegistry<EventMap>

  // private readonly _safety: SafetyManager<EventMap>

  // /* ------------------- Private helpers ------------------- */

  // /**
  //  * Safely remove a listener from the registry, ignoring errors.
  //  */

  private _removeListenerSafe<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: ListenerFn<EventMap, K>,
  ): void {
    try {
      this._listenerRegistry.removeListener(
        event as EventKey<EventMap>,
        listener as ListenerFn<EventMap, EventKey<EventMap>>,
      )
    } catch (err) {
      if (DEV_MODE) {
        // Log minimal context in development for debugging
        // Avoid throwing to keep disposer idempotent
        // eslint-disable-next-line no-console
        console.warn("SafeEmitter: failed to remove listener", {
          event,
          listener: typeof listener === "function" ? listener.name : undefined,
          error: err,
        })
      }
    }
  }

  private _onSingle<K extends AllEventKeys<EventMap>>(
    event: Extract<K, string>,
    originalListener: ListenerFn<EventMap, Extract<K, string>>,
    options?: SubscriptionOptions,
  ): DisposerFn {
    // 1️⃣ skip if not public or duplicate
    if (
      !isPublicEvent(event) ||
      !this._listenerRegistry ||
      this._listenerRegistry.hasListener(event, originalListener)
    ) {
      return () => void 0
    }

    // 2️⃣ Wrap listener once for Emittery
    const wrappedEmitteryListener = SafeEmitter._wrapListener(
      event,
      originalListener,
      async () => {},
      /*   async (ev, l, err) => {
          this.onListenerError(ev, err, {
            type: "on",
            listener: l as AnyListenerFn,
          })
        }, */
    )

    // 3️⃣ Register listener in the registry
    this._listenerRegistry.addPublicListener(
      event,
      originalListener,
      wrappedEmitteryListener as WrappedListener<EventMap, Extract<AllEventKeys<EventMap>, string>>,
    )

    // 4️⃣ Bind to Emittery instance
    const disposeEmittery = this._public.on(event, wrappedEmitteryListener, options)

    // 5️⃣ Return unified disposer
    return () => {
      safeCall(() => this._removeListenerSafe(event, originalListener))
      safeCall(() => disposeEmittery())
    }
  }

  // private _onSingle<K extends AllEventKeys<EventMap>>(
  //   event: K,
  //   originalListener: ListenerFn<EventMap, K>,
  //   options?: SubscriptionOptions,
  // ): DisposerFn {
  //   // ---------------------------------------------------------------------------
  //   // 1️⃣ Determine which registry to use
  //   // ---------------------------------------------------------------------------
  //   const registry = isPublicEvent(event) ? this._listenerRegistry : this._listenerRegistry

  //   // ---------------------------------------------------------------------------
  //   // 2️⃣ Prevent duplicate registrations
  //   // ---------------------------------------------------------------------------
  //   if (registry.hasListener(event, originalListener)) {
  //     return () => void 0
  //   }

  //   // ---------------------------------------------------------------------------
  //   // 3️⃣ Wrap listener once for Emittery (public events only)
  //   // ---------------------------------------------------------------------------
  //   const wrappedEmitteryListener = SafeEmitter._wrapListener(
  //     event,
  //     originalListener,
  //     async (ev, l, err) => {
  //       this.onListenerError(ev, err, {
  //         type: "on",
  //         listener: l as AnyListenerFn,
  //       })
  //     },
  //   ) as WrappedListener<EventMap, K>

  //   // ---------------------------------------------------------------------------
  //   // 4️⃣ Register listener in the appropriate registry
  //   //    (public: original → wrapped, internal: original only)
  //   // ---------------------------------------------------------------------------
  //   if (isPublicEvent(event)) {
  //     this._listenerRegistry.addListener(event, originalListener, () => wrappedEmitteryListener)
  //   } else {
  //     this._listenerRegistry.addListener(event, originalListener)
  //   }

  //   // ---------------------------------------------------------------------------
  //   // 5️⃣ Bind to Emittery
  //   // ---------------------------------------------------------------------------
  //   const disposeEmittery = this._public.on(event, wrappedEmitteryListener, options)

  //   // ---------------------------------------------------------------------------
  //   // 6️⃣ Unified disposer (idempotent + safe)
  //   // ---------------------------------------------------------------------------
  //   return () => {
  //     safeCall(() => this._removeListenerSafe(event, originalListener))
  //     safeCall(() => disposeEmittery())
  //     safeCall(() =>
  //       this.emitInternal(INTERNAL_ON_LISTENER_REMOVED, [
  //         event as string,
  //         originalListener as AnyListenerFn,
  //       ]),
  //     )
  //   }

  //   // // Return a disposer function
  //   // return () => {
  //   //   safeCall(() => this._removeListenerSafe(event, originalListener))
  //   //   safeCall(() => disposeEmittery())
  //   //   safeCall(() =>
  //   //     this.emitInternal(INTERNAL_ON_LISTENER_REMOVED, [
  //   //       event as string,
  //   //       originalListener as AnyListenerFn,
  //   //     ]),
  //   //   )
  //   // }
  // }

  // private _offSingle<K extends AllEventKeys<EventMap>>(
  //   event: K,
  //   originalListener: ListenerFn<EventMap, K>,
  // ): void {
  //   // 1️⃣ Determine which registry to use and get wrapped listener
  //   const registry = isPublicEvent(event) ? this._listenerRegistry : this._listenerRegistry
  //   const wrappedEmitteryListener = registry.getWrappedListener(event, originalListener)
  //   if (!wrappedEmitteryListener) return

  //   // 2️⃣ Remove from registry safely
  //   this._removeListenerSafe(event, originalListener)

  //   // 3️⃣ Remove from Emittery using the wrapped listener
  //   try {
  //     this._public.off(event, convertToEmitteryListener(wrappedEmitteryListener))
  //   } catch {
  //     if (DEV_MODE) {
  //       // eslint-disable-next-line no-console
  //       console.warn("SafeEmitter: failed to remove listener from Emittery", {
  //         event,
  //         listener: typeof originalListener === "function" ? originalListener.name : undefined,
  //       })
  //     }
  //   }

  //   // 4️⃣ Emit internal event for bookkeeping
  //   try {
  //     this.emitInternal(INTERNAL_ON_LISTENER_REMOVED, [
  //       event as string,
  //       originalListener as AnyListenerFn,
  //     ])
  //   } catch {
  //     // ignore errors
  //   }
  // }

  // Protected - symbol keys for internal events
  protected _onInternal<K extends Extract<EventKey<EventMap>, symbol>>(
    event: K,
    originalListener: ListenerFn<EventMap, K>,
    options?: SubscriptionOptions,
  ): DisposerFn {
    // 1️⃣ Prevent public registrations
    if (isPublicEvent(event)) {
      return () => void 0
    }

    // 2️⃣ Register internal listener (no wrapping)
    this._listenerRegistry.addInternalListener(event, originalListener)

    // 3️⃣ Convert event/listener for Emittery
    const [registryEvent, registryListener] = adaptListenerForRegistry(event, originalListener)

    // 4️⃣ Bind directly to Emittery
    const disposeEmittery = this._public.on(registryEvent, registryListener, options)

    // 5️⃣ Unified disposer
    return () => {
      safeCall(() => {
        this._listenerRegistry.removeListener(registryEvent, registryListener)
      })
      safeCall(() => disposeEmittery())
    }
  }

  /* ------------------- Public API: Listeners ------------------- */

  public on<K extends AllEventKeys<EventMap>>(
    event: K | readonly K[],
    listener: ListenerFn<EventMap, K>,
    options?: SubscriptionOptions,
  ): DisposerFn {
    // 1️⃣ Handle array of events (recursively)
    if (Array.isArray(event)) {
      return SafeEmitter._handleMultipleEvents(event as readonly K[], listener, (ev, l) =>
        this.on(ev, l, options),
      )
    }

    // 2️⃣ Branch: public (string) event
    type PublicK = Extract<K, string>
    if (isPublicEvent(event as AllEventKeys<EventMap>)) {
      return this._onSingle(event as PublicK, listener as ListenerFn<EventMap, PublicK>, options)
    }

    // 3️⃣ Branch: internal (symbol) event
    type InternalK = Extract<AllEventKeys<EventMap>, symbol>
    return this._onInternal(
      event as InternalK,
      listener as ListenerFn<EventMap, InternalK>,
      options,
    )
  }

  // public once<K extends AllEventKeys<EventMap>>(
  //   event: K,
  //   listener: ListenerFn<EventMap, K>,
  //   options?: SubscriptionOptions,
  // ): CancelablePromise<EventMap[K] | undefined> {
  //   // -------------------------
  //   // 1️⃣ Determine which registry to use
  //   // -------------------------
  //   const registry = isPublicEvent(event) ? this._listenerRegistry : this._listenerRegistry

  //   // -------------------------
  //   // 2️⃣ Prevent duplicates
  //   // -------------------------
  //   if (registry.hasListener(event, listener)) {
  //     return wrapCancelablePromise(Promise.resolve(undefined))
  //   }

  //   // -------------------------
  //   // 3️⃣ Register listener in the registry
  //   // -------------------------
  //   registry.addListener(event, listener)

  //   // -------------------------
  //   // 3️⃣ Wrap listener for error handling
  //   // -------------------------
  //   const wrappedEmitteryListener = SafeEmitter._wrapListener(
  //     event,
  //     listener,
  //     async (ev, l, err) => {
  //       this.onListenerError(ev, err, { type: "once", listener: l as AnyListenerFn })
  //     },
  //   ) as WrappedListener<EventMap, K>

  //   // -------------------------
  //   // 4️⃣ Create a promise that resolves with the payload
  //   // -------------------------

  //   const emitteryPromise = this._public.once(event, () => true)

  //   const promise = emitteryPromise.then(async data => {
  //     try {
  //       await wrappedEmitteryListener(data)
  //       return data
  //     } finally {
  //       this._removeListenerSafe(event, listener)
  //     }
  //   })

  //   const cancelablePromise = wrapCancelablePromise(promise, () =>
  //     this._removeListenerSafe(event, listener),
  //   )

  //   // 6️⃣ Handle AbortSignal
  //   if (options?.signal) {
  //     const onAbort = () => {
  //       cancelablePromise.off()
  //       this._removeListenerSafe(event, listener)
  //       try {
  //         options.signal?.removeEventListener("abort", onAbort)
  //       } catch {
  //         void 0
  //       }
  //     }

  //     if (options.signal.aborted) {
  //       onAbort()
  //     } else {
  //       options.signal.addEventListener("abort", onAbort)
  //       // Ensure we remove the abort listener when the promise settles normally
  //       void cancelablePromise.finally(() => {
  //         try {
  //           options.signal?.removeEventListener("abort", onAbort)
  //         } catch {
  //           void 0
  //         }
  //       })
  //     }
  //   }

  //   return cancelablePromise
  // }

  // public off<K extends AllEventKeys<EventMap>>(
  //   event: K | readonly K[],
  //   listener: ListenerFn<EventMap, K>,
  // ) {
  //   if (Array.isArray(event)) {
  //     const multiple = event as readonly K[]
  //     return SafeEmitter._handleMultipleEvents(multiple, listener, (ev, l) =>
  //       this._offSingle(ev, l),
  //     )
  //   }

  //   return this._offSingle(event as K, listener)
  // }

  // public listenerCount<K extends AllEventKeys<EventMap>>(eventName?: K | readonly K[]) { }

  // /* ------------------- Public API: Emit ------------------- */

  // public async emit<K extends AllEventKeys<EventMap>>(
  //   event: K,
  //   ...args: EmitArgs<AllEvents<EventMap>, K>
  // ) { }

  // /* ------------------- Protected: Error Handlers ------------------- */

  // protected onListenerError(
  //   eventName: AllEventKeys<EventMap>,
  //   error: unknown,
  //   context: ListenerErrorContext,
  // ) {
  //   // Only handle public events
  //   if (!isPublicEvent(eventName)) return

  //   try {
  //     this._safety?.recordListenerErrorFor(String(eventName), error, context.listener?.name)
  //   } catch {
  //     // ignore bookkeeping errors
  //   }
  // }

  // protected onEmitError(
  //   eventName: AllEventKeys<EventMap>,
  //   error: unknown,
  //   context?: { emitter?: unknown },
  // ) { }

  // /* ------------------- Protected: Internal Emitter ------------------- */

  // protected emitInternal<K extends keyof InternalEventMap<EventMap>>(
  //   key: K,
  //   payload: InternalEventMap<EventMap>[K],
  // ) {
  //   // Use a cast because Emittery types do not match our internal events
  //   const emitPromise = (this._public.emit as (event: unknown, data: unknown) => Promise<void>)(
  //     key as unknown as string,
  //     payload,
  //   )

  //   // Ignore internal emission errors to avoid infinite loops
  //   void emitPromise.catch(() => { })
  // }

  // /* ------------------- Static: Private utilities ------------------- */

  private static _handleMultipleEvents<
    EventMap extends BaseEventMap,
    K extends AllEventKeys<EventMap>,
  >(
    events: readonly K[],
    listener: ListenerFn<EventMap, K>,
    getDisposer: (ev: K, l: typeof listener) => DisposerFn,
  ): DisposerFn {
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

  private static _wrapListener<
    EventMap extends BaseEventMap,
    K extends Extract<AllEventKeys<EventMap>, string>,
  >(
    event: K,
    listener: ListenerFn<EventMap, K>,
    onError: (ev: K, l: typeof listener, err: unknown) => Awaitable,
  ): WrappedListener<EventMap, K> {
    return (async eventData => {
      // 1️⃣ Normalize eventData to tuple
      const args = emitteryArgToTuple(eventData) as EventMap[K]

      try {
        // 2️⃣ Execute original listener
        await listener(...args)
      } catch (err: unknown) {
        // 3️⃣ Wrap any thrown error
        const wrapped = new ListenerError({
          cause: err as ErrorCauseType | undefined,
          metadata: {
            event,
            listener: listener.name || "<anonymous>",
            eventData: args,
          },
        })

        // 4️⃣ Delegate to async error handler (never let error-handling throw)
        try {
          await onError(event, listener, wrapped)
        } catch {
          // Intentionally ignored: error-handling must never throw
        }

        // 5️⃣ Re-throw in development mode
        ListenerError.throwIfDev(wrapped)
      }
    }) as WrappedListener<EventMap, K>
  }
}

/* ------------------- Helper Functions ------------------- */
