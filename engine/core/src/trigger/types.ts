import type { ClockId } from "../clock/index.ts"

/** When a task becomes ready. Times are in the units of the named clock. */
export type Trigger =
  | { readonly kind: "now" }
  | { readonly kind: "after"; readonly n: number; readonly clock: ClockId }
  | { readonly kind: "at"; readonly t: number; readonly clock: ClockId }
