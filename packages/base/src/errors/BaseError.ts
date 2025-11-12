export type ErrorType = globalThis.Error
export type ErrorOptionsType = globalThis.ErrorOptions
export type ErrorCauseType = ErrorOptionsType['cause']

export interface BaseErrorOptions<Cause extends ErrorCauseType = unknown> extends ErrorOptionsType {
  cause?: Cause
}

export class BaseError<Cause extends ErrorCauseType = unknown> extends globalThis.Error {
  public override name: string = 'BaseError'
  public override cause?: Cause

  constructor(message: ErrorType['message'], options?: BaseErrorOptions<Cause>) {
    super(message, options)
    Object.setPrototypeOf(this, new.target.prototype) // Fix prototype chain

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }

    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }

  /**
   * String coercion for logging/serialization, including cause if present
   */
  toString(): string {
    const causeStr =
      typeof this.cause !== 'undefined' && this.cause !== null
        ? `\nCaused by: ${String(this.cause)}`
        : ''
    return `${this.name}: ${this.message}${causeStr}`
  }

  /**
   * Type guard for ergonomic narrowing and pattern matching
   * Uses precise constructor typing for maximum type safety
   */
  static is<T extends BaseError<unknown>>(
    this: new (...args: ConstructorParameters<typeof BaseError>) => T,
    error: unknown,
  ): error is T {
    return error instanceof this
  }
}
