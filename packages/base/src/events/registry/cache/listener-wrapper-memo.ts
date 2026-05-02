import type { BaseEventMap, SingleArgListener } from "@repo/types"

export class ListenerWrapperMemo<
  EventMap extends BaseEventMap,
  Key extends keyof EventMap = keyof EventMap,
  WrappedListener extends SingleArgListener<EventMap, Key> = SingleArgListener<EventMap, Key>,
> {
  /** WeakMap ensures original listener keys do not prevent GC */
  private _memo: WeakMap<SingleArgListener<EventMap, Key>, WrappedListener>

  constructor() {
    this._memo = new WeakMap()
  }

  /** Retrieve memoized listener without creating it */
  public get(original: SingleArgListener<EventMap, Key>): WrappedListener | undefined {
    return this._memo.get(original)
  }

  /** Memoize a listener */
  public set(original: SingleArgListener<EventMap, Key>, wrapped: WrappedListener): void {
    this._memo.set(original, wrapped)
  }

  /** Remove a listener from memo */
  public delete(original: SingleArgListener<EventMap, Key>): boolean {
    return this._memo.delete(original)
  }

  /** Reset the memo */
  public reset(): void {
    this._memo = new WeakMap()
  }
}
