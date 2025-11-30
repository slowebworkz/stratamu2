import { BaseError } from "@/errors"
import type { PublicEventMap } from "@/events"
import { INTERNAL_EVENT_KEYS, type InternalEvent } from "@/events"
import type { BaseEventMap } from "@repo/types"
import type Emittery from "emittery"

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

/**
 * True if the given symbol is one of our internal/private event symbols.
 */
export function isInternalEvent(event: unknown): event is InternalEvent {
  return typeof event === "symbol" && INTERNAL_EVENT_KEYS.has(event as InternalEvent)
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
 * Normalize a PropertyKey into a string key suitable for Map lookups.
 * - For string/number: returns as string.
 * - For symbol: returns a unique string with a prefix to avoid collisions.
 * - For undefined/null: returns undefined.
 */
export function normalizeEventKeyForMap(key?: PropertyKey): string | undefined {
  if (key == null) return undefined
  if (typeof key === "symbol") {
    const globalKey = Symbol.keyFor(key)
    if (globalKey) return `@@symbol:${globalKey}`
    const desc = key.description ?? ""
    return `@@symbol:${desc || key.toString()}`
  }
  return String(key)
}

export function incrementCount<K extends string>(map: Map<K, number>, key: K, delta = 1): number {
  const next = (map.get(key) ?? 0) + delta
  map.set(key, next)
  return next
}

export function sumMapValues<K>(m: ReadonlyMap<K, number>): number {
  let total = 0
  for (const v of m.values()) total += v
  return total
}
