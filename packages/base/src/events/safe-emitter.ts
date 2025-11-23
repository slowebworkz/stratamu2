import type { AnyListenerFn, ListenerErrorContext, PublicEventMap } from "@/events"
import {
  ListenerRegistry,
  isPublicEvent,
  SafetyEmitter as SafetyManager,
  INTERNAL_ON_EMIT_ERROR,
  INTERNAL_ON_LISTENER_ERROR,
  INTERNAL_ON_LISTENER_REMOVED,
  INTERNAL_ON_REMOVE_WARN,
  internalPublicBus,
  isInternalEvent,
} from "@/events"
import { emitWithErrorHandling } from "@/utils"
import { DEV_MODE } from "@/env"
import Emittery from "emittery"

import type {
  AllEventKeys,
  AllEvents,
  CancelablePromise,
  InternalEventMap,
  ListenerFn,
  WrappedCancelable,
} from "@/events"
import type { Awaitable, BaseEventMap } from "@repo/types"

export abstract class SafeEmitter<EventMap extends BaseEventMap<unknown[]>> {
  private readonly _listenerRegistry: ListenerRegistry<EventMap>

  protected readonly _public: Emittery<AllEvents<EventMap>> = new Emittery<AllEvents<EventMap>>()

  private readonly _safety: SafetyManager<EventMap>

  protected get _safetyManager(): SafetyManager<EventMap> {
    return this._safety
  }

  constructor() {
    this._listenerRegistry = new ListenerRegistry<EventMap>()

    // Compose the safety manager with hardcoded presets (no user config)
    // Compose the safety manager with hardcoded presets (no user config)
    const safetyManagerBus = new Emittery<PublicEventMap<EventMap>>()

    this._safety = new SafetyManager<EventMap>(safetyManagerBus, {
      sanitizeErrors: true,
      safetyLogCap: 100,
    })
  }

  public on<K extends AllEventKeys<EventMap>>(
    event: K | readonly K[],
    listener: ListenerFn<EventMap, K>,
    options?: { signal?: AbortSignal },
  ) {
    // Support subscribing to multiple events (array form) while keeping
    // our listener-mapping bookkeeping per-event so `off(original)` works.
    const events: readonly K[] = Array.isArray(event) ? event : [event]
    const disposers: (() => void)[] = []

    for (const e of events) {
      // Wrap the listener for error safety
      const safeListenerForE = ListenerRegistry.createSafeListener(
        e,
        listener,
        this.onListenerError.bind(this),
        { type: "on", listener: listener as AnyListenerFn, emitter: this },
      )

      // Register the original and wrapped listener in the registry
      this._listenerRegistry.addListener(e, listener, () => safeListenerForE)

      // Subscribe the wrapped listener to the underlying event bus
      this._public.on(e, (eventData: EventMap[K]) => safeListenerForE(...eventData), options)
      disposers.push(() => this.off(e, listener))
    }

    return () => {
      for (const d of disposers) d()
    }
  }

  public once<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: (data: AllEvents<EventMap>[K]) => Awaitable,
    options?: { signal?: AbortSignal },
  ): CancelablePromise<AllEvents<EventMap>[K]> {
    const originalPromise = this._public.once(event) as WrappedCancelable<AllEvents<EventMap>[K]>

    // Let the registry handle all the async complexity
    return ListenerRegistry.createOncePromise(
      originalPromise,
      listener as (data: AllEvents<EventMap>[K]) => Promise<void> | void,
      (eventKey: K, error: unknown, context: unknown) =>
        this.onListenerError(eventKey, error, {
          type: "once",
          listener: listener as (...args: unknown[]) => Awaitable,
          emitter: this,
        }),
      { event, type: "once" as const, listener, emitter: this } as {
        event: K
        type: "once"
        listener: (data: AllEvents<EventMap>[K]) => Awaitable
        emitter: SafeEmitter<EventMap>
      },
      options,
    ) as CancelablePromise<AllEvents<EventMap>[K]>
  }

  public off<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: ListenerFn<EventMap, K>,
  ): boolean {
    // Get the wrapped listener from the registry
    const wrappedListener = this._listenerRegistry.getWrappedListener(event, listener)

    if (!wrappedListener) {
      // Listener not found - could emit a warning event in dev mode
      return false
    }

    // Remove from registry first
    const removed = this._listenerRegistry.removeListener(event, listener)

    if (removed) {
      // Remove from the underlying emitter
      // The wrapped listener expects spread args, so we need to convert
      this._public.off(event, (eventData: EventMap[K]) => wrappedListener(...eventData))

      // Mark that we've seen this event
      this._listenerRegistry.addSeenEvent(event)

      return true
    }

    return false
  }

  public async emit<K extends AllEventKeys<EventMap>>(
    event: K,
    ...args: AllEvents<EventMap>[K] extends undefined ? [] : [AllEvents<EventMap>[K]]
  ): Promise<void> {
    // Mark that we've seen this event
    this._listenerRegistry.addSeenEvent(event)

    // Use emitWithErrorHandling for consistent error handling and extensibility
    const promises = emitWithErrorHandling(args, data =>
      this._public.emit(event, data as AllEvents<EventMap>[K]),
    )

    // Handle all promises with allSettled to continue even if some fail
    const results = await Promise.allSettled(promises)

    // Report any errors through the dedicated emit error handler
    for (const result of results) {
      if (result.status === "rejected") {
        this.onEmitError(event, result.reason, {
          emitter: this,
        })
      }
    }
  }

  public listenerCount(
    eventName?: AllEventKeys<EventMap> | readonly AllEventKeys<EventMap>[],
  ): number {
    if (eventName === undefined) {
      return this._listenerRegistry.getListenerCount()
    }
    if (Array.isArray(eventName)) {
      let total = 0
      for (const name of eventName) {
        total += this._listenerRegistry.getListenerCount(name)
      }
      return total
    }
    return this._listenerRegistry.getListenerCount(eventName as AllEventKeys<EventMap>)
  }

  protected onListenerError(
    eventName: keyof AllEvents<EventMap>,
    error: unknown,
    context: ListenerErrorContext,
  ) {
    // Only emit internal error event for public events, not internal/private events
    if (isPublicEvent(eventName)) {
      // Delegate to internal safety manager if present; keep try/catch to
      // avoid bookkeeping failures affecting the emitter.
      try {
        this._safety?.recordListenerErrorFor(String(eventName), error, context.listener?.name)
      } catch {
        // ignore errors in bookkeeping
        void 0
      }

      if (DEV_MODE) {
        // Emit internal event for development logging
        this.emitInternal(INTERNAL_ON_LISTENER_ERROR, [eventName, error, context])
      }
    }
  }

  protected onEmitError(
    eventName: AllEventKeys<EventMap>,
    error: unknown,
    context?: { emitter?: unknown },
  ) {
    if (isPublicEvent(eventName)) {
      try {
        this._safety?.recordListenerErrorFor(String(eventName), error)
      } catch {
        void 0
      }

      this.emitInternal(INTERNAL_ON_EMIT_ERROR, [
        eventName,
        error,
        { ...(context || {}), emitter: this },
      ])
    }
  }

  protected emitInternal<K extends keyof InternalEventMap<EventMap>>(
    key: K,
    payload: InternalEventMap<EventMap>[K],
  ): void {
    // Fire and forget internal event emission
    // Type assertion is safe because InternalEventMap<EventMap> is part of AllEvents<EventMap>
    void (this._public.emit as (event: unknown, data: unknown) => Promise<void>)(
      key,
      payload,
    ).catch(() => {
      // Ignore internal event emission errors to avoid infinite loops
    })
  }
}

/**
 * Attach abort wiring to the original promise: if the provided signal aborts,
 * call `originalPromise.off()` (if present). Returns a cleanup function that
 * removes the attached listener.
 */
function wireAbortToPromise<T>(
  originalPromise: WrappedCancelable<T>,
  signal?: AbortSignal,
): (() => void) | undefined {
  if (!signal) return undefined

  const onAbort = () => {
    try {
      originalPromise.off?.()
    } catch {
      void 0
    }
  }

  if (signal?.aborted) {
    onAbort()
    return undefined
  }

  try {
    signal.addEventListener("abort", onAbort)
  } catch {
    void 0
  }

  return () => {
    try {
      signal.removeEventListener("abort", onAbort)
    } catch {
      void 0
    }
  }
}

/**
 * Await the original promise, invoke the listener and notify on listener errors.
 * Returns a promise that resolves to the original payload.
 */
function createListenerWrappedPromise<T>(
  originalPromise: WrappedCancelable<T>,
  listener: (data: T) => Awaitable,
  notifyListenerError: (error: unknown) => void,
): Promise<T> {
  return (async () => {
    const data = await originalPromise
    try {
      await listener(data)
    } catch (err) {
      notifyListenerError(err)
    }
    return data
  })()
}

/** Compose the small helpers into a single cancelable once promise. */
function createCancelableOnce<T>(
  originalPromise: WrappedCancelable<T>,
  listener: (data: T) => Awaitable, // listener invoked with payload
  options: { signal?: AbortSignal } | undefined,
  notifyListenerError: (error: unknown) => void,
): WrappedCancelable<T> {
  const cleanup = wireAbortToPromise(originalPromise, options?.signal)

  const wrapped = createListenerWrappedPromise(
    originalPromise,
    listener,
    notifyListenerError,
  ) as WrappedCancelable<T>

  attachOffForwarding(originalPromise, wrapped)

  // Ensure the abort listener is removed when the wrapped promise settles.
  wrapped.finally(() => {
    try {
      cleanup?.()
    } catch {
      void 0
    }
  })

  return wrapped
}

/**
 * Bind `.off` from the original promise onto the wrapped promise when available.
 */
function attachOffForwarding<T>(
  originalPromise: WrappedCancelable<T>,
  wrapped: WrappedCancelable<T>,
): void {
  if (typeof originalPromise.off === "function") {
    try {
      wrapped.off = originalPromise.off.bind(originalPromise)
    } catch {
      void 0
    }
  }
}
