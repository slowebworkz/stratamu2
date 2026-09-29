import { ExceptionalErrors } from "./exceptional-errors.ts"
import type { ErrorCapability } from "./types.ts"

let root: ErrorCapability | undefined

/** Sets the error capability used by every Base instance that does not provide its own. */
export function setRootErrors(errors: ErrorCapability): void {
  root = errors
}

/** Creates or returns the process-wide error capability. */
export function createErrorCapability(): ErrorCapability {
  root ??= ExceptionalErrors.create()
  return root
}
