import type { Awaitable } from "../base/index.ts"

// Generic listener function type for any event signature (for internal/error use only)
export type AnyListenerFn = (...args: unknown[]) => Awaitable
