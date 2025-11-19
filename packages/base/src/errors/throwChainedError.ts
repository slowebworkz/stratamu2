// Helper to throw a chained error
import type { BaseErrorOptions, ErrorCauseType } from "./BaseError.ts"
import { BaseError } from "./BaseError.ts"

export function throwChainedError<Cause extends ErrorCauseType = unknown>(
  message: string,
  cause: Cause,
  options?: Omit<BaseErrorOptions<Cause>, "cause">,
): never {
  throw new BaseError<Cause>(message, { ...options, cause })
}
