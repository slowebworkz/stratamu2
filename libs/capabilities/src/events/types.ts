// ─────────────────────────────────────────────
// Event primitives
// ─────────────────────────────────────────────

export type EventName = string | symbol | number

export type EventMap = Record<EventName, unknown>

export type EventPayload<Events extends EventMap, Event extends keyof Events> = Events[Event]

export type EventListener<Data> = (data: Data) => void | Promise<void>

export type UnsubscribeFunction = () => void

// ─────────────────────────────────────────────
// Event options
// ─────────────────────────────────────────────

export interface EventSubscriptionOptions {
  signal?: AbortSignal
}

export interface EventOnceOptions<Data> extends EventSubscriptionOptions {
  predicate?: (data: Data) => boolean
}

/**
 * A promise representing a pending event subscription.
 *
 * It resolves with the event's payload when the event occurs. Calling `off()` cancels the
 * subscription and rejects the promise, and so does aborting its `AbortSignal`, with the signal's
 * reason. Once the promise has settled, cancelling it again does nothing.
 */
export type EventOncePromise<Data> = Promise<Data> & {
  off(): void
}

// ─────────────────────────────────────────────
// Event capability
// ─────────────────────────────────────────────

/**
 * A notification bus: it reports what happened and lets other components react.
 * It does not order or perform authoritative work, which belongs to the engine.
 *
 * `Events` maps each event name to its payload. Declare it as a type alias, not an interface:
 * an interface has no index signature, so it does not satisfy `EventMap`.
 */
export interface EventCapability<Events extends EventMap = EventMap> {
  on<Event extends keyof Events>(
    event: Event,
    listener: EventListener<EventPayload<Events, Event>>,
    options?: EventSubscriptionOptions,
  ): UnsubscribeFunction

  /**
   * Waits for the first matching event.
   *
   * The returned promise resolves with the event's payload when the event occurs. The subscription
   * can be cancelled with `off()` or with `options.signal`, and either way the promise rejects:
   * with an `AbortError`, or with the signal's own reason if it was aborted with one.
   */
  once<Event extends keyof Events>(
    event: Event,
    options?: EventOnceOptions<EventPayload<Events, Event>>,
  ): EventOncePromise<EventPayload<Events, Event>>

  off<Event extends keyof Events>(
    event: Event,
    listener: EventListener<EventPayload<Events, Event>>,
  ): void

  emit<Event extends keyof Events>(
    event: Event,
    ...data: [EventPayload<Events, Event>] extends [undefined]
      ? []
      : [data: EventPayload<Events, Event>]
  ): Promise<void>
}
