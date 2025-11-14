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
    this.name = new.target.name // Dynamically set error name for subclasses

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
    const causeStr = this.cause
      ? `\nCaused by: ${
          BaseError.is(this.cause)
            ? (this.cause.stack ?? this.cause.message)
            : JSON.stringify(this.cause)
        }`
      : ''
    return `${this.name}: ${this.message}${causeStr}`
  }

  /**
   * Type guard for ergonomic narrowing and pattern matching
   * Uses precise constructor typing for maximum type safety
   */
  static is<E extends BaseError<any>>(this: new (...args: any[]) => E, error: unknown): error is E {
    return error instanceof this
  }

  /**
   * Encapsulates a double-nested try-catch error chaining pattern.
   * Executes innerFn, wraps any error with innerMessage, then wraps again with outerMessage.
   * Uses the class's constructor for correct subclassing and type safety.
   */
  static wrap<T, E extends BaseError<any>>(
    this: new (...args: any[]) => E,
    innerFn: () => T,
    innerMessage: string,
    outerMessage: string,
  ): T {
    try {
      try {
        return innerFn()
      } catch (innerErr) {
        throw new this(innerMessage, { cause: innerErr })
      }
    } catch (outerErr) {
      throw new this(outerMessage, { cause: outerErr })
    }
  }

  /**
   * Async version of wrap for error chaining in async workflows.
   */
  static async wrapAsync<T, E extends BaseError<any>>(
    this: new (...args: any[]) => E,
    innerFn: () => Promise<T>,
    innerMessage: string,
    outerMessage: string,
  ): Promise<T> {
    try {
      try {
        return await innerFn()
      } catch (innerErr) {
        throw new this(innerMessage, { cause: innerErr })
      }
    } catch (outerErr) {
      throw new this(outerMessage, { cause: outerErr })
    }
  }

  /**
   * Returns the deepest (root) cause in the error chain.
   */
  get rootCause(): unknown {
    let cause: unknown = this.cause
    while (cause instanceof BaseError && cause.cause) {
      cause = cause.cause
    }
    return cause
  }
}
