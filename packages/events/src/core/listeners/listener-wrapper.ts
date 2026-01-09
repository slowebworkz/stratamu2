import type { BaseEventMap, SingleArgListener } from "@repo/types"
import type { AllEventKeys, SubscriptionOptions } from "../../types/index.ts"
import type { SafetyManager } from "../safety/index.ts"
import { safeCall } from "@repo/base"

export type ListenerWrapperOptions<
  EventMap extends BaseEventMap,
  ListenerKey extends AllEventKeys<EventMap>,
> = SubscriptionOptions & {
  safety: SafetyManager<EventMap>
  onRemove: (event: ListenerKey, listener: SingleArgListener<EventMap, ListenerKey>) => void
}

export class ListenerWrapper<
  EventMap extends BaseEventMap,
  ListenerKey extends Extract<AllEventKeys<EventMap>, string>,
> {
  /**
   * ListenerWrapper instances should only be referenced via WeakMap in registries.
   * Do not store strong references outside of registry/cache logic.
   * This ensures proper garbage collection when listeners are removed.
   */
  /* -------------- 🔒 Private Internals --------------------- */
  /**
   * Static helper for WeakMap registry usage.
   * Example: const registry = new WeakMap<SingleArgListener, ListenerWrapper>()
   * Use registry.set(originalListener, wrapper) and registry.get(originalListener)
   */
  public static weakRegistry<EventMap extends BaseEventMap, ListenerKey extends Extract<AllEventKeys<EventMap>, string>>() {
    return new WeakMap<SingleArgListener<EventMap, ListenerKey>, ListenerWrapper<EventMap, ListenerKey>>()
  }

  /** The original user-provided listener (used for removal) */
  private readonly original: SingleArgListener<EventMap, ListenerKey>

  /** Event key this listener is bound to */
  private readonly event: ListenerKey

  /** Whether this listener should auto-remove after first call */
  private readonly once: boolean

  private readonly _safety: SafetyManager<EventMap>

  private readonly _onRemove: (
    event: ListenerKey,
    listener: SingleArgListener<EventMap, ListenerKey>,
  ) => void

  /** Tracks if the listener has been called (for once semantics) */
  private _called = false

  /* -------------- 🔨 Constructor -------------------------- */

  constructor(
    event: ListenerKey,
    listener: SingleArgListener<EventMap, ListenerKey>,
    options: ListenerWrapperOptions<EventMap, ListenerKey>,
  ) {
    this.event = event
    this.original = listener
    this.once = options?.once ?? false

    this._safety = options.safety
    this._onRemove = options.onRemove
  }

  /* -------------- 🚀 Private Invocation --------------------- */

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
   * Returns a bound listener function for this wrapper.
   * Useful for passing as a callback.
   */
  public get listener(): SingleArgListener<EventMap, ListenerKey> {
    return this.invoke.bind(this)
  }

  /* -------------- 🧠 Private: Invocation Lifecycle ---------- */

  /**
   * Executes the original listener.
   */
  private async _callListener(payload: EventMap[ListenerKey]): Promise<void> {
    await this.original(payload)
  }

  /**
   * Handles errors thrown by the listener.
   * Never throws.
   */
  private _handleInvocationError(error: unknown): void {
    try {
      this._safety.recordListenerErrorFor(this.event, error, this.original.name || "<anonymous>")
    } catch {
      // Safety handling must never throw
    }
  }

  /**
   * Final cleanup after invocation.
   * `once` listeners are removed even if invocation throws.
   *
   * This matches typical emitter semantics and is a deliberate policy decision:
   *
   * - Listeners are removed even if the listener throws
   * - Even if SafetyManager throws
   * - Even if the listener rejects
   *
   * This avoids future confusion about removal on error.
   */
  private _handleOnceRemoval(): void {
    if (!this.once) return
    safeCall(() => this._onRemove(this.event, this.original))
  }

  /* -------------- 🏷️ Static: Invocation Decision ---------- */

  /**
   * Determines whether the listener should be invoked (static).
   * Used to avoid relying on instance 'this'.
   */
  private static _canInvokeOnce(once: boolean, called: boolean): boolean {
    if (once && called) return false
    return true
  }
}
