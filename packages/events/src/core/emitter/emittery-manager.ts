import type { Awaitable, BaseEventMap } from "@repo/types"
import type { AllEventKeys, SubscriptionOptions, UnsubscribeFunction } from "../../types/index.ts"
import Emittery from "emittery"
import type { OmnipresentEventData } from "emittery"

/**
 * If the event has a payload, this resolves to a single-element tuple [Payload].
 * If the event has no payload (undefined), it resolves to an empty tuple [].
 */
type EventPayload<M extends BaseEventMap, K extends keyof M> = M[K] extends undefined ? [] : [M[K]]

/** Payload type for a given event key K, fully compatible with Emittery */
type Payload<EventMap extends BaseEventMap, K extends AllEventKeys<EventMap>> = EventPayload<
  EventMap & OmnipresentEventData,
  K
>

export class EmitteryManager<EventMap extends BaseEventMap> {
  /* -------------- 🔒 Private Emitter ----------------------- */

  private readonly _emitter: Emittery<EventMap & OmnipresentEventData>

  /* -------------- 🔨 Constructor -------------------------- */

  constructor() {
    this._emitter = new Emittery<EventMap & OmnipresentEventData>()
  }

  /** Register a listener for a single event or multiple events */
  public on<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: (payload: EventMap[K]) => Awaitable,
    options?: SubscriptionOptions,
  ): UnsubscribeFunction
  public on<K extends AllEventKeys<EventMap>>(
    event: readonly K[],
    listener: (payload: EventMap[K]) => Awaitable,
    options?: SubscriptionOptions,
  ): UnsubscribeFunction
  public on<K extends AllEventKeys<EventMap>>(
    event: K | readonly K[],
    listener: (payload: EventMap[K]) => Awaitable,
    options?: SubscriptionOptions,
  ): UnsubscribeFunction {
    if (Array.isArray(event)) {
      const disposers = event.map(ev => this.on(ev, listener as any, options ?? {}))
      return () => disposers.forEach(d => d())
    }

    return this._emitter.on(event, listener, options ?? {})
  }

  /** Fully type-safe `once` method for EmitteryManager */
  public async once<K extends AllEventKeys<EventMap>>(
    event: K,
  ): Promise<EventPayload<EventMap, K>[0]>

  public async once<K extends AllEventKeys<EventMap>>(
    event: readonly K[],
  ): Promise<{ key: K; payload: EventMap[K] }>

  public once<K extends AllEventKeys<EventMap>>(
    event: K | readonly K[],
  ): Promise<EventPayload<EventMap, K>[0] | { key: K; payload: EventMap[K] }> {
    if (Array.isArray(event)) {
      // Map each event to a promise that resolves with its key & payload
      const promises = event.map(ev =>
        this._emitter.once(ev).then((payload: any) => ({ key: ev, payload })),
      )
      // Return the first promise to resolve (first event to fire)
      return Promise.race(promises)
    } else {
      // Single event, return payload directly
      return this._emitter.once(event) as Promise<EventPayload<EventMap, K>[0]>
    }
  }

  /** Remove a listener for a single event or multiple events */
  public off<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: (payload: EventMap[K]) => Awaitable,
  ): void
  public off<K extends AllEventKeys<EventMap>>(
    event: readonly K[],
    listener: (payload: EventMap[K]) => Awaitable,
  ): void
  public off<K extends AllEventKeys<EventMap>>(
    event: K | readonly K[],
    listener: (payload: EventMap[K]) => Awaitable,
  ): void {
    if (Array.isArray(event)) {
      for (const ev of event) {
        this._emitter.off(ev, listener)
      }
    }

    this._emitter.off(event, listener)
  }

  /**
   * Emit an event with the given payload.
   * If the event has no payload, payload argument can be omitted.
   */
  public emit<K extends AllEventKeys<EventMap>>(
    event: K,
    ...payload: Payload<EventMap, K>
  ): Promise<void> {
    return this._emitter.emit(event, ...(payload as [any]))
  }

  /**
   * Listen to all events.
   * The listener receives the event name and the corresponding payload.
   */
  public onAny(
    listener: <Data extends EventMap & OmnipresentEventData>(
      event: keyof Data,
      payload: Data[keyof Data],
    ) => Awaitable,
  ): UnsubscribeFunction {
    return this._emitter.onAny(listener)
  }

  /**
   * Stop listening to all events.
   */
  public offAny(
    listener: <Data extends EventMap & OmnipresentEventData>(event: keyof Data) => Awaitable,
  ): void {
    this._emitter.offAny(listener)
  }

  /**
   * Get an async iterator for a specific event (yields payloads for that event).
   */
  public events<K extends AllEventKeys<EventMap>>(
    event: K,
  ): AsyncIterableIterator<Payload<EventMap, K>[0]> {
    return this._emitter.events(event)
  }

  /**
   * Clear all listeners, or listeners for specific events.
   */
  public clearListeners<K extends AllEventKeys<EventMap>>(event?: K | readonly K[]): void {
    if (event) {
      this._emitter.clearListeners(event)
    } else {
      this._emitter.clearListeners()
    }
  }

  /* -------------- 🛠️ Private Utilities & Hacks ------------ */
}
