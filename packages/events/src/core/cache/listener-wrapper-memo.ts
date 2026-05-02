import type { BaseEventMap, SingleArgListener } from "@repo/types"

/**
 * Type alias for the WeakMap used to memoize original → wrapped listeners.
 */
export type ListenerMemoMap<EventMap extends BaseEventMap, K extends keyof EventMap, W> = WeakMap<
  SingleArgListener<EventMap, K>,
  W
>

export class ListenerWrapperMemo<
  EventMap extends BaseEventMap,
  RegistryKey extends keyof EventMap = keyof EventMap,
> {
  /* -------------- 🔒 Private Storage ----------------------- */

  /** WeakMap ensures original listener keys do not prevent GC */
  private _memo!: ListenerMemoMap<EventMap, RegistryKey, SingleArgListener<EventMap, RegistryKey>>

  /* -------------- 🔨 Constructor --------------------------- */

  constructor() {
    this.reset()
  }

  /* -------------- 📤 Public Accessors --------------------- */

  /** Retrieve memoized listener without creating it */
  public get(
    original: SingleArgListener<EventMap, RegistryKey>,
  ): SingleArgListener<EventMap, RegistryKey> | undefined {
    return this._memo.get(original)
  }

  /* -------------- ✏️ Public Mutators ---------------------- */

  /** Memoize a listener */
  public set(
    original: SingleArgListener<EventMap, RegistryKey>,
    wrapped: SingleArgListener<EventMap, RegistryKey>,
  ): void {
    this._memo.set(original, wrapped)
  }

  /** Remove a listener from memo */
  public delete(original: SingleArgListener<EventMap, RegistryKey>): boolean {
    return this._memo.delete(original)
  }

  /** Reset the memo */
  public reset(): void {
    this._memo = new WeakMap<
      SingleArgListener<EventMap, RegistryKey>,
      SingleArgListener<EventMap, RegistryKey>
    >()
  }
}
