/**
 * Normalize the event name to a concrete single value (take first if array).
 */
export function normalizeEventName<K>(eventName: readonly K[] | K): K | undefined {
  if (Array.isArray(eventName)) {
    return eventName.length > 0 ? eventName[0] : undefined;
  }
  return eventName as K;
}
