import { safeCallAsync } from "@repo/base"
import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { ListenerKeys, ListenerWrapperOptions } from "../../types/index.ts"

export class ListenerWrapper<
  EventMap extends BaseEventMap,
  ListenerKey extends ListenerKeys<EventMap>,
> {
  /* -------------- 🔗 Private: Listeners  ------------------- */

  /** The original listener function. */
  private readonly original: SingleArgListener<EventMap, ListenerKey>
  private readonly wrapped: SingleArgListener<EventMap, ListenerKey>

  /* -------------- ⚙️ Options ----------------------------- */

  /** If true, listener is removed after first call. */
  private readonly once: NonNullable<ListenerWrapperOptions<EventMap, ListenerKey>["once"]>

  private readonly _onError?: ListenerWrapperOptions<EventMap, ListenerKey>["onError"]

  private readonly _onRemove?: ListenerWrapperOptions<EventMap, ListenerKey>["onRemove"]

  /** Tracks if the listener has been called. */
  private _called = false

  /** Tracks if the listener has been removed. */
  private _removed = false

  /* -------------- 🔨 Constructor -------------------------- */

  constructor(
    listener: SingleArgListener<EventMap, ListenerKey>,
    options: ListenerWrapperOptions<EventMap, ListenerKey>,
  ) {
    this.original = listener
    this.once = options?.once ?? false
    if (typeof options?.onError === "function") this._onError = options.onError
    if (typeof options?.onRemove === "function") this._onRemove = options.onRemove

    // 🔑 Wrap and enforce type
    this.wrapped = this._ensureListenerTypeMatch(this.invoke.bind(this))
  }

  /* -------------- 🚀 Private Invocation ------------------- */

  private async invoke(payload: EventMap[ListenerKey]): Promise<void> {
    const shouldInvoke = ListenerWrapper._canInvokeOnce(this.once, this._called)
    if (!shouldInvoke) return
    if (this.once) this._called = true

    try {
      await this._callListener(payload)
    } catch (error) {
      this._handleInvocationError(error)
    } finally {
      this._handleOnceRemoval()
    }
  }

  /* -------------- 🪝 Public Accessors --------------------- */

  /**
   * Returns the wrapped listener function.
   */
  public get listener(): SingleArgListener<EventMap, ListenerKey> {
    return this.wrapped
  }

  /**
   * Manually removes the listener, firing onRemove if not already removed.
   */
  public remove(): void {
    if (this._removed) return
    this._removed = true
    void safeCallAsync(() => this._onRemove?.(this.original))
  }

  /* -------------- 🧠 Private: Invocation Lifecycle -------- */

  /** Calls the original listener. */
  private async _callListener(payload: EventMap[ListenerKey]): Promise<void> {
    await safeCallAsync(() => this.original(payload))
  }

  /** Handles errors thrown by the listener. */
  private _handleInvocationError(error: unknown): void {
    void safeCallAsync(() => this._onError?.(error, this.original.name || "<anonymous>"))
  }

  /**
   * Removes the listener after invocation if once is true.
   */
  private _handleOnceRemoval(): void {
    if (!this.once || this._removed) return
    this._removed = true

    void safeCallAsync(() => this._onRemove?.(this.original))
  }


  /**
   * Compile-time type check for SingleArgListener signature.
   * Returns the function as-is; ensures type compatibility.
   */
  private _ensureListenerTypeMatch(
    fn: SingleArgListener<EventMap, ListenerKey>
  ): SingleArgListener<EventMap, ListenerKey> {
    return fn
  }

  /* -------------- 🏷️ Static: Weak Registry --------------- */

  /**
   * Helper for WeakMap registry usage.
   */
  public static weakRegistry<
    EventMap extends BaseEventMap,
    ListenerKey extends ListenerKeys<EventMap>,
  >() {
    return new WeakMap<
      SingleArgListener<EventMap, ListenerKey>,
      ListenerWrapper<EventMap, ListenerKey>
    >()
  }

  /* -------------- 🏷️ Static: Invocation Decision --------- */

  /** Returns true if the listener should be invoked. */
  private static _canInvokeOnce(once: boolean, called: boolean): boolean {
    if (once && called) return false
    return true
  }
}
