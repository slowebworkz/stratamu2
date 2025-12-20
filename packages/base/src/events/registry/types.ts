import type { BaseEventMap, EventKey, ListenerFn } from "@repo/types"

/* =================== External Types (Public API) =================== */

/** Listener function bound to a specific event */
export type EventListener<EventMap extends BaseEventMap, K extends EventKey<EventMap>> = ListenerFn<
  EventMap,
  K
>

/* =================== Internal Types (Storage) =================== */

/** Set of wrapped listeners for a single event (internal storage) */
export type EventListenerSetInternal<
  EventMap extends BaseEventMap,
  WrappedListener,
> = Set<WrappedListener>

/** Mapping of original listener → wrapped listener (for a single event) */
export type EventListenerWrapperMap<
  EventMap extends BaseEventMap,
  K extends EventKey<EventMap>,
  WrappedListener = EventListener<EventMap, K>,
> = Map<EventListener<EventMap, K>, WrappedListener>

/* =================== Registry Type Aliases =================== */

/** Registry of listener sets, keyed by event (stores wrapped listeners) */
export type EventListenerSetRegistry<EventMap extends BaseEventMap, WrappedListener> = Map<
  EventKey<EventMap>,
  EventListenerSetInternal<EventMap, WrappedListener>
>

/** Registry of listener wrapper maps, keyed by event */
export type EventListenerWrapperRegistry<
  EventMap extends BaseEventMap,
  WrappedListener = EventListener<EventMap, EventKey<EventMap>>,
> = Map<EventKey<EventMap>, EventListenerWrapperMap<EventMap, EventKey<EventMap>, WrappedListener>>

/* =================== Helper Type Aliases =================== */

/** Generic alias for a wrapper map for a specific event */
export type WrapperMapFor<
  EventMap extends BaseEventMap,
  E extends EventKey<EventMap>,
  WrappedListener,
> = EventListenerWrapperMap<EventMap, E, WrappedListener>

/* =================== Cache Value Types =================== */

/** Cached array of wrapped listeners */
export type CachedWrappedListeners<WrappedListener> = ReadonlyArray<WrappedListener>

/** Cached array of original listeners for a specific event */
export type CachedOriginalListeners<EventMap extends BaseEventMap> = ReadonlyArray<
  EventListener<EventMap, EventKey<EventMap>>
>

/* =================== Minimal Line-Reducing Aliases =================== */

/** Listener for any event key in the map (used in nested caches) */
export type AnyEventListener<EventMap extends BaseEventMap> = EventListener<
  EventMap,
  EventKey<EventMap>
>

/** Per-event cache map used under a listener WeakMap */
export type PerEventCache<EventMap extends BaseEventMap, WrappedListener> = Map<
  EventKey<EventMap>,
  WrappedListener
>

/** Nested WeakMap cache: listener → (event → wrapped) */
export type ListenerEventCache<EventMap extends BaseEventMap, WrappedListener> = WeakMap<
  AnyEventListener<EventMap>,
  PerEventCache<EventMap, WrappedListener>
>
