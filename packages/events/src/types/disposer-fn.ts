/**
 * Function that disposes/cleans up resources (listeners, subscriptions, etc.).
 * Returned by `.on()`, `.once()`, and other registration methods.
 */
export type DisposerFn = () => void
