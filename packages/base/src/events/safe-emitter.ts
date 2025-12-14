import type { OmnipresentEventData } from "emittery"
import Emittery from "emittery"

import { DEV_MODE } from "@/env"

import type { ErrorCauseType } from "@/errors"
import { BaseError } from "@/errors"

import type {
  AllEventKeys,
  AllEvents,
  CancelablePromise,
  DisposerFn,
  EmitArgs,
  InternalEventMap,
  PublicEventMap,
  SafeOncePromise,
  SubscriptionOptions,
  Tuplefy,
  WrappedCancelable,
} from "@/events"
import {
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_REMOVE_WARN,
  ListenerRegistry,
  SafetyEmitter as SafetyManager,
  emitteryArgToTuple,
  internalPublicBus,
  isInternalEvent,
  isPublicEvent,
  tupleToEmitteryArg,
  wrapCancelablePromise
} from "@/events"

import { emitWithErrorHandling } from "@/utils"

import type {
  AnyListenerFn,
  Awaitable,
  BaseEventMap,
  ListenerErrorContext,
  ListenerFn,
} from "@repo/types"

export abstract class SafeEmitter<EventMap extends BaseEventMap> {
  /* ------------------- Private instance fields ------------------- */

  private readonly _listenerRegistry: ListenerRegistry<EventMap>

  private readonly _safety: SafetyManager<EventMap>

  /* ------------------- Private helpers ------------------- */

  /**
   * Safely remove a listener from the registry, ignoring errors.
   */
  private _removeListenerSafe<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: ListenerFn<EventMap, K>,
  ): void {
    try {
      this._listenerRegistry.removeListener(event, listener)
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

  /* ------------------- Protected ------------------- */

  protected readonly _public: Emittery<AllEvents<EventMap>> = new Emittery<AllEvents<EventMap>>()

  protected get _safetyManager(): SafetyManager<EventMap> {
    return this._safety
  }

  constructor() {
    this._listenerRegistry = new ListenerRegistry<EventMap>()

    // Compose the safety manager with hardcoded presets (no user config)
    const safetyManagerBus = new Emittery<PublicEventMap<EventMap>>()

    this._safety = new SafetyManager<EventMap>(safetyManagerBus, {
      sanitizeErrors: true,
      safetyLogCap: 100,
    })
  }

  private _onSingle<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: ListenerFn<EventMap, K>,
    options?: SubscriptionOptions,
  ): DisposerFn {
    /* --- Prevent duplicates --- */
    if (this._listenerRegistry.hasListener(event, listener)) {
      return () => void 0
    }

    /* --- Register in registry --- */
    this._listenerRegistry.addListener(event, listener)

    /* --- Choose binding strategy --- */
    const isPublic = isPublicEvent(event)
    const wrappedListener = SafeEmitter._wrapListener(
      event,
      listener,
      isPublic
        ? async (ev, l, err) => {
          this.onListenerError(ev, err, {
            type: "on",
            listener: l as AnyListenerFn,
          })
        }
        : async () => void 0,
    )

    // Bind using Emittery, respecting options
    const disposeEmittery = this._public.on(event, wrappedListener, options)

    // Return a disposer function
    return () => {
      const safe = (fn: () => void) => {
        try {
          fn()
        } catch {
          void 0
        }
      }

      safe(() => this._removeListenerSafe(event, listener))
      safe(() => disposeEmittery())
      safe(() =>
        this.emitInternal(INTERNAL_ON_LISTENER_REMOVED, [
          event as string,
          listener as AnyListenerFn,
        ]),
      )
    }
  }

  /* ------------------- Public API: Listeners ------------------- */

  public on<K extends AllEventKeys<EventMap>>(
    event: K | readonly K[],
    listener: ListenerFn<EventMap, K>,
    options?: SubscriptionOptions,
  ): DisposerFn {
    if (Array.isArray(event)) {
      const multiple = event as readonly K[]
      return SafeEmitter._handleMultipleEvents(multiple, listener, (ev, l) =>
        this._onSingle(ev, l, options),
      )
    }

    return this._onSingle(event as K, listener, options)
  }

  public once<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: ListenerFn<EventMap, K>,
    options?: SubscriptionOptions,
  ): CancelablePromise<EventMap[K] | undefined> {

    // -------------------------
    // 1️⃣ Prevent duplicates
    // -------------------------
    if (this._listenerRegistry.hasListener(event, listener)) {
      return wrapCancelablePromise(Promise.resolve(undefined))
    }

    // -------------------------
    // 2️⃣ Register listener in the registry
    // -------------------------
    this._listenerRegistry.addListener(event, listener)

    // -------------------------
    // 3️⃣ Wrap listener for error handling
    // -------------------------
    const wrappedListener = SafeEmitter._wrapListener(event, listener, async (ev, l, err) => {
      this.onListenerError(ev, err, { type: "once", listener: l as AnyListenerFn })
    })

    // -------------------------
    // 4️⃣ Create a promise that resolves with the payload
    // -------------------------

    const emitteryPromise = this._public.once(event, () => true)

    const promise = emitteryPromise.then(async data => {
      try {
        await wrappedListener(data)
        return data
      } finally {
        this._removeListenerSafe(event, listener)
      }
    })

    const cancelablePromise = wrapCancelablePromise(
      promise,
      () => this._removeListenerSafe(event, listener),
    )

    // 6️⃣ Handle AbortSignal
    if (options?.signal) {
      const onAbort = () => {
        cancelablePromise.off()
        this._removeListenerSafe(event, listener)
        try { options.signal?.removeEventListener("abort", onAbort) } catch { void 0 }
      }

      if (options.signal.aborted) {
        onAbort()
      } else {
        options.signal.addEventListener("abort", onAbort)
        // Ensure we remove the abort listener when the promise settles normally
        void cancelablePromise.finally(() => {
          try { options.signal?.removeEventListener("abort", onAbort) } catch { void 0 }
        })
      }
    }

    return cancelablePromise
  }

  public off<K extends AllEventKeys<EventMap>>(event: K, listener: ListenerFn<EventMap, K>) { }

  public listenerCount<K extends AllEventKeys<EventMap>>(eventName?: K | readonly K[]) { }

  /* ------------------- Public API: Emit ------------------- */

  public async emit<K extends AllEventKeys<EventMap>>(
    event: K,
    ...args: EmitArgs<AllEvents<EventMap>, K>
  ) { }

  /* ------------------- Protected: Error Handlers ------------------- */

  protected onListenerError(
    eventName: AllEventKeys<EventMap>,
    error: unknown,
    context: ListenerErrorContext,
  ) {
    // Only handle public events
    if (!isPublicEvent(eventName)) return

    try {
      this._safety?.recordListenerErrorFor(String(eventName), error, context.listener?.name)
    } catch {
      // ignore bookkeeping errors
    }
  }

  protected onEmitError(
    eventName: AllEventKeys<EventMap>,
    error: unknown,
    context?: { emitter?: unknown },
  ) { }

  /* ------------------- Protected: Internal Emitter ------------------- */

  protected emitInternal<K extends keyof InternalEventMap<EventMap>>(
    key: K,
    payload: InternalEventMap<EventMap>[K],
  ) {
    // Use a cast because Emittery types do not match our internal events
    const emitPromise = (this._public.emit as (event: unknown, data: unknown) => Promise<void>)(
      key as unknown as string,
      payload,
    )

    // Ignore internal emission errors to avoid infinite loops
    void emitPromise.catch(() => { })
  }

  /* ------------------- Static: Private utilities ------------------- */

  private static _handleMultipleEvents<
    EventMap extends BaseEventMap,
    K extends AllEventKeys<EventMap>,
  >(
    events: readonly K[],
    listener: ListenerFn<EventMap, K>,
    getDisposer: (ev: K, l: typeof listener) => DisposerFn,
  ): DisposerFn {
    // -------------------------
    // 1️⃣ Collect disposers for each event
    // -------------------------
    const disposers = events
      .map(ev => getDisposer(ev, listener))
      .filter((d): d is DisposerFn => typeof d === "function")

    // -------------------------
    // 2️⃣ Return a single disposer
    // -------------------------
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

  private static _wrapListener<EventMap extends BaseEventMap, K extends AllEventKeys<EventMap>>(
    event: K,
    listener: ListenerFn<EventMap, K>,
    onError: (ev: K, l: typeof listener, err: unknown) => Awaitable,
  ) {
    return async (eventData: EventMap[K]): Promise<void> => {
      // -------------------------
      // 1️⃣ Normalize eventData to tuple
      // -------------------------
      const args = emitteryArgToTuple(eventData) as EventMap[K]

      try {
        // -------------------------
        // 2️⃣ Execute original listener
        // -------------------------
        await listener(...args)
      } catch (err) {
        // -------------------------
        // 3️⃣ Wrap any thrown error
        // -------------------------
        const wrapped = new BaseError("Listener execution failed", {
          cause: err instanceof Error ? err : undefined,
          code: "LISTENER_EXECUTION_ERROR",
          category: "logic",
          metadata: {
            event,
            listener: listener.name || "<anonymous>",
            eventData: args,
          },
        })

        // -------------------------
        // 4️⃣ Delegate to async error handler
        // -------------------------
        await onError(event, listener, wrapped)

        // -------------------------
        // 5️⃣ Re-throw in development mode
        // -------------------------
        if (DEV_MODE) throw wrapped
      }
    }
  }
}

/* ------------------- Helper Functions ------------------- */
