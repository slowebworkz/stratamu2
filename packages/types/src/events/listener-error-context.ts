import type { AnyListenerFn } from "./index.ts"

/**
 * Developer-friendly union type for public event names (string literals + arbitrary strings).
 */

export type ListenerErrorContext<Emitter = unknown> = {
  type: "on" | "once"
  listener?: AnyListenerFn
  hasFilter?: boolean
  emitter?: Emitter
}
