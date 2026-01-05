import { BaseError } from "@/errors"
import { INTERNAL_EVENT_KEYS } from "@/events"
import type { InternalEventKey, PublicEventMap } from "@/events"
import type { BaseEventMap } from "@repo/types"
import type Emittery from "emittery"

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

/**
 * True if the given symbol is one of our internal/private event symbols.
 */
export function isInternalEvent(event: unknown): event is InternalEventKey {
  return typeof event === "symbol" && INTERNAL_EVENT_KEYS.has(event as InternalEventKey)
}

/**
 * True if the event is *not* one of our internal symbol events.
 * This cleanly infers: event is a key of EventMap (string only).
 */
export function isPublicEvent(event: PropertyKey): event is string {
  return typeof event !== "symbol" || !isInternalEvent(event)
}

// -----------------------------------------------------------------------------
// Fire and Forget helpers
// -----------------------------------------------------------------------------

export async function fireAndForgetGeneric(
  promise: Promise<void>,
  context?: string,
  onError?: (error: unknown) => void,
): Promise<void> {
  try {
    await promise
  } catch (err) {
    const wrapped =
      err instanceof BaseError
        ? err
        : new BaseError(context ? `${context}: ${String(err)}` : String(err), {
            cause: err instanceof Error ? err : undefined,
          })

    if (onError) onError(wrapped)
  }
}

// -----------------------------------------------------------------------------
// Internal Bus Getter
// -----------------------------------------------------------------------------

/**
 * Returns a typed view of the emitter’s *public* event bus.
 * Ensures internal symbol event keys do not leak into external API surfaces.
 */
export function internalPublicBus<EventMap extends BaseEventMap>(self: {
  _public: Emittery<PublicEventMap<EventMap>>
}): Emittery<PublicEventMap<EventMap>> {
  return self._public
}

/**
 * Normalize a PropertyKey for map lookups.
 * - Undefined/null → undefined
 * - Global symbols → string tag (stable across realms)
 * - Local symbols → preserved as-is
 * - Numbers/strings → preserved as-is
 */
export function normalizeEventKeyForMap(key?: PropertyKey): PropertyKey | undefined {
  if (key == null) return undefined

  if (typeof key === "symbol") {
    const globalKey = Symbol.keyFor(key)
    if (globalKey) return `@@symbol:${globalKey}`
    return key
  }

  return key
}

export function incrementCount<K extends PropertyKey>(
  map: Map<K, number>,
  key: K,
  delta = 1,
): number {
  const next = (map.get(key) ?? 0) + delta
  map.set(key, next)
  return next
}

export function sumMapValues<K>(m: ReadonlyMap<K, number>): number {
  let total = 0
  for (const v of m.values()) total += v
  return total
}
