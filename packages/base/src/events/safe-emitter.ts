import { ListenerRegistry } from '@/events'
import Emittery from 'emittery'

import type { AllEventKeys, AllEvents, ListenerFn } from '@/events'
import type { Awaitable, BaseEventMap } from '@repo/types'

export abstract class SafeEmitter<EventMap extends BaseEventMap<unknown[]>> {
  private readonly _listenerRegistry: ListenerRegistry<EventMap>

  protected readonly _public: Emittery<AllEvents<EventMap>> = new Emittery<AllEvents<EventMap>>()
  constructor() {
    this._listenerRegistry = new ListenerRegistry<EventMap>()
  }

  public on<K extends AllEventKeys<EventMap>>(
    event: K | readonly K[],
    listener: ListenerFn<{ [E in K]: [AllEvents<EventMap>[E]] }, K>,
    options?: { signal?: AbortSignal },
  ) {
    // Support subscribing to multiple events (array form) while keeping
    // our listener-mapping bookkeeping per-event so `off(original)` works.
    const events = Object.freeze(([] as K[]).concat(event)) as readonly K[]
    const disposers: (() => void)[] = []

    for (const e of events) {
      // Wrap the listener for error safety
      const safeListenerForE = ListenerRegistry.createSafeListener(
        e,
        listener,
        this.onListenerError.bind(this),
        { type: 'on', listener, emitter: this }
      )

      // Register the original and wrapped listener in the registry
      this._listenerRegistry.addListener(e, listener, () => safeListenerForE)

      // Subscribe the wrapped listener to the underlying event bus
      this._public.on(e, safeListenerForE, options)
      disposers.push(() => this.off(e, listener))
    }

    return () => {
      for (const d of disposers) d()
    }
  }

  public once<K extends AllEventKeys<EventMap>>(
    event: K
  ) { }

  public off<K extends AllEventKeys<EventMap>>(
    event: K
  ) { }

  public emit<K extends AllEventKeys<EventMap>>(
    event: K
  ) { }

  protected onListenerError(
    eventName: AllEventKeys<EventMap>,
    error: unknown,
    context: {
      type: 'on' | 'once'
      listener?: (...args: any[]) => Awaitable
      hasFilter?: boolean
      emitter?: unknown
    },
  ) { }
}
