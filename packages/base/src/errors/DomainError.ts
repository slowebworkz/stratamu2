// Example of a domain-specific type error
import type { BaseErrorOptions, ErrorCauseType, ErrorType } from "./BaseError.ts"
import type { Except, Merge } from "type-fest"
import { BaseError } from "./BaseError.ts"

export interface DomainErrorOptions<Cause extends ErrorCauseType = unknown>
  extends BaseErrorOptions<Cause> {}

// Fallback to the underlying Error message type (string). The previous
// conditional extraction could resolve to `never` which made the
// constructor message type incompatible with `BaseError`'s `string`
// parameter. Use `ErrorType["message"]` for a stable string type.
export type DomainErrorMessage = ErrorType["message"]

// Strongly-typed options type for DomainError
export type DomainErrorOptionsWithCause<Cause extends ErrorCauseType = unknown> = Merge<
  Except<DomainErrorOptions<Cause>, "cause">,
  { cause?: Cause }
>

export class DomainError<Cause extends ErrorCauseType = unknown> extends BaseError<Cause> {
  public override name = "DomainError"

  constructor(message: DomainErrorMessage, options?: DomainErrorOptionsWithCause<Cause>) {
    super(message, options)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
