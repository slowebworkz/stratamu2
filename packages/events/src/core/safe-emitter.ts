import { BaseError, DEV_MODE } from "@repo/base"
import { EmitteryManager } from "./emitter/index.ts"
import { ListenerWrapper } from "./listeners/listener-wrapper.js"

import type { BaseEventMap, EventKey, EventKeyType, SingleArgListener } from "@repo/types"
import type {
  AllEventKeys,
  DisposerFn,
  EventCollections,
  ListenerKeys,
  ListenerWrapperOptions,
  SubscriptionOptions,
} from "../types/index.ts"
import { ListenerRegistry } from "./registry/index.ts"
import { SafetyManager } from "./safety/index.ts"

export class SafeEmitter<EventMap extends BaseEventMap> {
  /* -------------- 🔒 Private Storage ----------------------- */

  private readonly _listenerRegistry = new ListenerRegistry<
    EventMap,
    SingleArgListener<EventMap, AllEventKeys<EventMap>>
  >()

  private readonly _safety: SafetyManager<EventMap>

  /* -------------- 🛡️ Protected Storage -------------------- */

  protected readonly _public: EmitteryManager<EventMap>

  /* -------------- 🔨 Constructor -------------------------- */

  constructor() {
    this._safety = new SafetyManager<EventMap>({
      sanitizeErrors: true,
      safetyLogCap: 100,
    })

    this._public = new EmitteryManager<EventMap>()
  }

  /* -------------- 📣 Public API: Listeners ---------------- */

  /**
   * Registers a listener for the specified event.
   */
  // Single event
  public on<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: SingleArgListener<EventMap, K>,
    options?: SubscriptionOptions,
  ): void

  // Multiple events
  public on<K extends AllEventKeys<EventMap>>(
    event: readonly K[],
    listener: SingleArgListener<EventMap, K>,
    options?: SubscriptionOptions,
  ): void

  public on<K extends AllEventKeys<EventMap>>(
    event: K | readonly K[],
    listener: SingleArgListener<EventMap, K>,
    options?: SubscriptionOptions,
  ) {
    const events = (Array.isArray(event) ? event : [event]) as readonly K[]

    const { publicEvents, internalEvents } = SafeEmitter._splitEvents(events)

    if (publicEvents.length) {
      this.publicListener(
        publicEvents,
        listener as SingleArgListener<EventMap, string>,
        {
          once: false,
          onError: (er, c) => {
            // Throw a BaseError for public event listener errors
            throw new BaseError(`Listener error on public event: ${String(c)}`, { cause: er })
          },
        },
      )

      //
      // this._listenerRegistry.add(
      //   publicEvents,
      //   publicListener,
      //   wrapped.listener
      // )

      // return this._public.on(
      //   publicEvents,
      //   wrapped.listener,
      //   options ?? {}
      // )
    }

    const internalListener = listener as SingleArgListener<EventMap, typeof internalEvents[number]>

    // add to registry
    // this._listenerRegistry.add(
    //   publicEvents,
    //   internalListener,
    //   listener
    // )

    // this._listenerRegistry.add(internalEvents, listener, listener)
    // return this._public.on(internalEvents, listener, options ?? {})









    /* else if (internalEvents.length) {
     this._listenerRegistry.add(internalEvents, listener, listener)

     return this._public.on(internalEvents as K[], listener)
   } */

    debugger
  }

  /*
    // public on<K extends AllEventKeys<EventMap>>(
    //   event: K | readonly K[],
    //   listener: SingleArgListener<EventMap, K>,
    //   options?: SubscriptionOptions,
    // ): void {
    //   // Only handle single event (not array)
    //   if (Array.isArray(event)) {
    //     throw new Error("Array of events not supported in this implementation.")
    //   }

    //   if (typeof event !== "string") return

    //   // wrap listener
    //   const wrapped = new ListenerWrapper<EventMap, K & string>(event, listener, {
    //     safety: this._safety,
    //     onRemove: (ev, l) => this._removeListenerSafe(ev, l),
    //     once: false,
    //   })



    //   // add to native Emittery
    //   this._public.on(event, wrapped.listener, options)
    // }

    // /**
    //  * Registers a one-time listener for the specified event.
    //  */
  // public once<K extends AllEventKeys<EventMap>>(
  //   event: K | readonly K[],
  //   listener: SingleArgListener<EventMap, K>,
  //   options?: SubscriptionOptions,
  // ): void {
  //   // TODO: Implement one-time listener registration
  // }

  // /**
  //  * Removes a listener for the specified event.
  //  */
  // public off<K extends AllEventKeys<EventMap>>(
  //   event: K | readonly K[],
  //   listener: SingleArgListener<EventMap, K>,
  // ): void {
  //   // TODO: Implement listener removal
  // }

  /* -------------- 🔍 Protected: Accessors ----------------- */

  protected get safetyManager(): SafetyManager<EventMap> {
    return this._safety
  }

  /* -------------- Private: Listeners ----------------------- */




  private publicListener<ListenerKey extends ListenerKeys<EventMap>>(
    events: AllEventKeys<EventMap>[],
    listener: SingleArgListener<EventMap, typeof events[number]>,
    options: ListenerWrapperOptions<EventMap, ListenerKey>
  ) {
    // Filter to only public events (string keys)
    const publicEvents = events.filter(ev => typeof ev === "string") as EventCollections<EventMap>["publicEvents"]

    const wrapped = new ListenerWrapper<EventMap, typeof publicEvents[number]>(
      listener,
      options
    )

    // const wrapped = new ListenerWrapper<EventMap, typeof events[number]>(
    //   listener,
    //   options
    // )

    // add to registry
    this._listenerRegistry.add(
      events,
      listener,
      wrapped.listener
    )

    // for (const ev of events) {
    //   this._registerPublicListener(ev, listener, options)

    // }
  }






  /* -------------- 🔧 Private utilities --------------------- */

  private _handleMultipleEvents<K extends AllEventKeys<EventMap>>(
    events: readonly K[],
    listener: SingleArgListener<EventMap, K>,
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

  private _removeListenerSafe<K extends AllEventKeys<EventMap>>(
    event: K,
    listener: SingleArgListener<EventMap, K>,
  ): void {
    try {
      this._listenerRegistry.remove(event, listener)
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

  private _registerPublicListener<K extends EventKey<EventMap>>(
    event: K,
    listener: SingleArgListener<EventMap, K>,
    options?: SubscriptionOptions
  ) {
    this._public.on(event, listener, options)
  }


  /* -------------- 🧩 Private Static Utilities -------------- */

  private static _splitEvents<
    EventMap extends BaseEventMap,
    K extends keyof EventMap
  >(events: readonly K[]): EventCollections<EventMap> {
    const publicEvents: string[] = []
    const internalEvents: symbol[] = []

    for (const ev of events) {
      if (typeof ev === "string") {
        publicEvents.push(ev as Extract<K, string>)
      } else if (typeof ev === "symbol") {
        internalEvents.push(ev as Extract<K, symbol>)
      }
    }

    return {
      publicEvents,
      internalEvents,
    } as EventCollections<EventMap>
  }
}
