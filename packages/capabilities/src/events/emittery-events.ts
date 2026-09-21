import Emittery from "emittery"

import { createContextLogger } from "../logging/root-logger.ts"
import type { LoggingCapability } from "../logging/types.ts"
import type {
  EventCapability,
  EventListener,
  EventMap,
  EventOnceOptions,
  EventOncePromise,
  EventPayload,
  EventSubscriptionOptions,
  UnsubscribeFunction,
} from "./types.ts"

type WrappedListener = (event: { data?: unknown }) => void | Promise<void>

interface LooseEmitter<Events extends EventMap> {
  emit(event: keyof Events, ...data: unknown[]): Promise<void>
}

export class EmitteryEvents<Events extends EventMap = EventMap> implements EventCapability<Events> {
  readonly #emitter = new Emittery<Events>()

  readonly #listeners = new Map<keyof Events, Map<EventListener<unknown>, WrappedListener>>()

  #log?: LoggingCapability

  protected get log(): LoggingCapability {
    return this.#getLogger()
  }

  on<K extends keyof Events>(
    event: K,
    listener: EventListener<EventPayload<Events, K>>,
    options?: EventSubscriptionOptions,
  ): UnsubscribeFunction {
    const signal = options?.signal

    if (signal?.aborted) {
      return () => {}
    }

    const wrapped = this.#getOrCreateWrappedListener(event, listener)
    const unsubscribe = this.#emitter.on(event, wrapped, options)

    return this.#createSubscriptionCleanup(event, listener, unsubscribe, signal)
  }

  off<K extends keyof Events>(event: K, listener: EventListener<EventPayload<Events, K>>): void {
    const wrapped = this.#listeners.get(event)?.get(listener as EventListener<unknown>)

    if (!wrapped) {
      return
    }

    this.#emitter.off(event, wrapped)
    this.#forget(event, listener as EventListener<unknown>)
  }

  once<K extends keyof Events>(
    event: K,
    options?: EventOnceOptions<EventPayload<Events, K>>,
  ): EventOncePromise<EventPayload<Events, K>> {
    return this.#once(event, options)
  }

  emit<K extends keyof Events>(
    event: K,
    ...data: [EventPayload<Events, K>] extends [undefined] ? [] : [data: EventPayload<Events, K>]
  ): Promise<void> {
    return this.#emit(event, ...data)
  }

  #getLogger(): LoggingCapability {
    this.#log ??= createContextLogger(this.constructor.name || "anonymous")

    return this.#log
  }

  #getOrCreateWrappedListener<K extends keyof Events>(
    event: K,
    listener: EventListener<EventPayload<Events, K>>,
  ): WrappedListener {
    let listeners = this.#listeners.get(event)

    if (!listeners) {
      listeners = new Map()
      this.#listeners.set(event, listeners)
    }

    let wrapped = listeners.get(listener as EventListener<unknown>)

    if (!wrapped) {
      wrapped = EmitteryEvents.#wrap(listener)
      listeners.set(listener as EventListener<unknown>, wrapped)
    }

    return wrapped
  }

  #createSubscriptionCleanup<K extends keyof Events>(
    event: K,
    listener: EventListener<EventPayload<Events, K>>,
    unsubscribe: UnsubscribeFunction,
    signal: AbortSignal | undefined,
  ): UnsubscribeFunction {
    let active = true

    // Emittery drops the subscription itself when the signal aborts, so this registry has to
    // follow, or it would keep the listener alive after it can no longer be called.
    const release = () => {
      if (!active) {
        return
      }

      active = false
      signal?.removeEventListener("abort", release)
      unsubscribe()
      this.#forget(event, listener as EventListener<unknown>)
    }

    signal?.addEventListener("abort", release, { once: true })

    return release
  }

  #once<K extends keyof Events>(
    event: K,
    options: EventOnceOptions<EventPayload<Events, K>> | undefined,
  ): EventOncePromise<EventPayload<Events, K>> {
    const predicate = options?.predicate
    const signal = options?.signal
    const source = this.#emitter.once(event, {
      signal,
      predicate: predicate ? ({ data }) => predicate(data as EventPayload<Events, K>) : undefined,
    })

    let cancel = () => {}

    const promise = new Promise<EventPayload<Events, K>>((resolve, reject) => {
      source.then(({ data }) => resolve(data as EventPayload<Events, K>), reject)

      cancel = () => {
        source.off()
        // off() deliberately rejects the promise. Mark the rejection as handled so callers
        // can cancel and discard the promise without producing an unhandled rejection.
        promise.catch(() => {})
        // An abort that already happened is the cause, even if its rejection has not reached this
        // promise yet. Otherwise use the reason an AbortController produces when aborted without
        // one, so off() and a signal abort reject with the same error.
        reject(signal?.aborted ? signal.reason : AbortSignal.abort().reason)
      }
    })

    return Object.assign(promise, { off: cancel })
  }

  #emit<K extends keyof Events>(
    event: K,
    ...data: [EventPayload<Events, K>] extends [undefined] ? [] : [data: EventPayload<Events, K>]
  ): Promise<void> {
    // Emittery's overloads cannot be satisfied by a generic event key, so call it through a loose view.
    return (this.#emitter as unknown as LooseEmitter<Events>).emit(event, ...data)
  }

  // Looks the map up again instead of holding one from registration time: an earlier
  // unsubscribe may have dropped that map, and a newer one for the same event can exist.
  #forget(event: keyof Events, listener: EventListener<unknown>): void {
    const listeners = this.#listeners.get(event)

    if (!listeners) {
      return
    }

    listeners.delete(listener)

    if (listeners.size === 0) {
      this.#listeners.delete(event)
    }
  }

  static #wrap<Payload>(listener: EventListener<Payload>): WrappedListener {
    return ({ data }) => listener(data as Payload)
  }
}
