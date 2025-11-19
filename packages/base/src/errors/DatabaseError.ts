// Example of a domain-specific error
import type { BaseErrorOptions, ErrorCauseType, ErrorType } from "./BaseError.ts"
import { BaseError } from "./BaseError.ts"

export interface DatabaseErrorOptions<Cause extends ErrorCauseType = unknown>
  extends BaseErrorOptions<Cause> {}

export class DatabaseError<Cause extends ErrorCauseType = unknown> extends BaseError<Cause> {
  public override name = "DatabaseError"

  constructor(message: ErrorType["message"], options?: DatabaseErrorOptions<Cause>) {
    super(message, options)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
