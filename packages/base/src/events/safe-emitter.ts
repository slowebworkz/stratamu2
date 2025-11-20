import type { AnyListenerFn } from "@/events"
import { ListenerRegistry } from "@/events"
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

  constructor() {
    this._listenerRegistry = new ListenerRegistry<EventMap>()
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
          emitter: this
        }),
      { event, type: "once" as const, listener, emitter: this } as {
        event: K
        type: "once"
        listener: (data: AllEvents<EventMap>[K]) => Awaitable
        emitter: SafeEmitter<EventMap>
      },
      options
    ) as CancelablePromise<AllEvents<EventMap>[K]>
  }





  public off<K extends AllEventKeys<EventMap>>(event: K, listener: ListenerFn<EventMap, K>) { }

  public emit<K extends AllEventKeys<EventMap>>(event: K) { }

  protected onListenerError(
    eventName: AllEventKeys<EventMap>,
    error: unknown,
    context: {
      type: "on" | "once"
      listener?: AnyListenerFn
      hasFilter?: boolean
      emitter?: unknown
    },
  ) { }
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
    signal.addEventListener('abort', onAbort)
  } catch {
    void 0
  }

  return () => {
    try {
      signal.removeEventListener('abort', onAbort)
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
  if (typeof originalPromise.off === 'function') {
    try {
      wrapped.off = originalPromise.off.bind(originalPromise)
    } catch {
      void 0
    }
  }
}
