import { getGlobalThis } from "@/node"
import { EError } from "exceptional-errors"
import isPlainObject from "is-plain-object"

import type {
  BaseErrorOptions,
  ErrorCategory,
  ErrorCauseType,
  MetadataObject,
  BaseErrorMetadataCopy,
  SerializedError,
} from "@/errors"
import { register } from "@/errors"
import type { JsonObject } from "type-fest"

const global = getGlobalThis()

// Type for constructor functions used in stack trace capture
type ErrorConstructorType = new (...args: unknown[]) => unknown

export class BaseError<
  Meta extends MetadataObject = MetadataObject,
  Cause extends ErrorCauseType = ErrorCauseType,
> extends EError<Meta, Error> {
  // ============================================================================
  // Public Properties
  // ============================================================================

  public override name = "BaseError"
  public readonly code?: string
  public readonly category?: ErrorCategory
  public readonly metadata?: Meta

  // ============================================================================
  // Constructor
  // ============================================================================

  constructor(message: string)
  constructor(options: BaseErrorOptions<Cause, Meta>)
  constructor(message: string, options: BaseErrorOptions<Cause, Meta>)
  constructor(
    messageOrOptions: string | BaseErrorOptions<Cause, Meta>,
    maybeOptions?: BaseErrorOptions<Cause, Meta>,
  ) {
    if (typeof messageOrOptions === "string") {
      const message = messageOrOptions
      const options = maybeOptions

      if (options?.cause && options?.metadata) {
        super(message, {
          cause: ensureErrorCause(options.cause),
          info: options.metadata,
        })
      } else if (options?.cause) {
        super(message, {
          cause: ensureErrorCause(options.cause),
        })
      } else if (options?.metadata) {
        super(message, { info: options.metadata })
      } else {
        super(message)
      }
    } else {
      const options = messageOrOptions
      if (options.cause && options.metadata) {
        super({
          cause: ensureErrorCause(options.cause),
          info: options.metadata,
        })
      } else if (options.cause) {
        super({
          cause: ensureErrorCause(options.cause),
        })
      } else if (options.metadata) {
        super({ info: options.metadata })
      } else {
        super()
      }
    }

    if (new.target.name) {
      this.name = new.target.name
    }

    // Safe captureStackTrace check for Node, Bun, etc.
    captureErrorStackTrace(this, this.constructor as ErrorConstructorType)
  }

  // ============================================================================
  // Public Getters
  // ============================================================================

  /**
   * Get the root cause of the error chain (manual traversal, independent of EError ordering)
   */
  get rootCause(): ErrorCauseType {
    let current = this.cause
    let rootCause: ErrorCauseType = undefined

    while (current) {
      rootCause = current
      if (current instanceof BaseError) {
        current = current.cause
      } else {
        break // Non-BaseError causes end the chain
      }
    }

    return rootCause
  }

  /**
   * Get the immediate cause of this error (uses EError's built-in cause property)
   */
  get immediateCause(): ErrorCauseType {
    return this.cause
  }

  // ============================================================================
  // Public Chain Navigation Methods
  // ============================================================================

  /**
   * Get length of error chain (uses EError's inherited getCauses)
   */
  get chainLength(): number {
    return super.getCauses().length
  }

  /**
   * Get array of error names in chain (uses EError's inherited getCauses)
   */
  get chainNames(): string[] {
    return super.getCauses().map(error => error.name)
  }

  /**
   * Find the first error in the chain that matches the given predicate
   */
  public findInChain(
    predicate: (error: BaseError<MetadataObject, ErrorCauseType>) => boolean,
  ): BaseError<MetadataObject, ErrorCauseType> | null {
    // Check root error first
    if (predicate(this)) return this

    // Manual traversal of the cause chain
    let current = this.cause
    while (current instanceof BaseError) {
      if (predicate(current)) {
        return current
      }
      current = current.cause
    }

    return null
  }

  /**
   * Find all errors in the chain that match the given predicate
   */
  public findAllInChain(
    predicate: (error: BaseError<MetadataObject, ErrorCauseType>) => boolean,
  ): BaseError<MetadataObject, ErrorCauseType>[] {
    const matches: BaseError<MetadataObject, ErrorCauseType>[] = []

    // Check root error first
    if (predicate(this)) matches.push(this)

    // Manual traversal of the cause chain
    let current = this.cause
    while (current instanceof BaseError) {
      if (predicate(current)) {
        matches.push(current)
      }
      current = current.cause
    }

    return matches
  }

  /**
   * Find error by type (constructor) in the chain
   */
  public findByType<T extends BaseError<MetadataObject, ErrorCauseType>>(
    errorClass: new (...args: unknown[]) => T,
  ): T | null {
    const found = this.findInChain(error => error instanceof errorClass)
    return found as T | null
  }

  // ============================================================================
  // Public Convenience Methods
  // ============================================================================

  /**
   * Find BaseError by code in chain
   */
  public findByCode(code: string): BaseError<MetadataObject, ErrorCauseType> | null {
    return this.findInChain(error => error.code === code)
  }

  /**
   * Find BaseError by category in chain
   */
  public findByCategory(category: ErrorCategory): BaseError<MetadataObject, ErrorCauseType> | null {
    return this.findInChain(error => error.category === category)
  }

  /**
   * Check if error chain contains BaseError with specific code
   */
  public hasCode(code: string): boolean {
    return this.findByCode(code) !== null
  }

  /**
   * Check if error chain contains BaseError with specific category
   */
  public hasCategory(category: ErrorCategory): boolean {
    return this.findByCategory(category) !== null
  }

  /**
   * Serialize this error to a JSON-compatible format
   */
  public serialize(): SerializedError {
    const serialized: SerializedError = {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      metadata: this.metadata as JsonObject | undefined,
      stack: this.stack,
    }

    // Handle cause serialization - use immediate cause for proper nesting
    if (this.cause) {
      if (this.cause instanceof BaseError) {
        // Recursively serialize BaseError causes to preserve full chain
        serialized.cause = this.cause.serialize()
      } else if (this.cause instanceof Error) {
        // For non-BaseError Error causes, preserve critical Error fields
        serialized.cause = {
          name: this.cause.name,
          message: this.cause.message,
          stack: this.cause.stack,
        }
      } else {
        // For non-Error causes, convert to string
        serialized.cause = String(this.cause)
      }
    }

    return serialized
  }

  // ============================================================================
  // Static Methods
  // ============================================================================

  /**
   * Helper to copy metadata from another BaseError
   */
  static copyFrom(sourceError: unknown): BaseErrorMetadataCopy {
    return copyErrorMetadata(sourceError)
  }

  static is<E extends BaseError<MetadataObject, ErrorCauseType>>(
    this: new (
      message: string,
      options?: BaseErrorOptions<ErrorCauseType, MetadataObject>,
    ) => E,
    error: unknown,
  ): error is E {
    return error instanceof this
  }

  static wrap<T, E extends BaseError<MetadataObject, ErrorCauseType>>(
    this: new (
      message: string,
      options?: BaseErrorOptions<ErrorCauseType, MetadataObject>,
    ) => E,
    innerFn: () => T,
    innerMessage: string,
    outerMessage: string,
  ): T {
    try {
      try {
        return innerFn()
      } catch (innerErr) {
        throw new this(innerMessage, {
          cause: innerErr instanceof Error ? innerErr : undefined,
          ...copyErrorMetadata(innerErr),
        })
      }
    } catch (outerErr) {
      throw new this(outerMessage, {
        cause: outerErr instanceof Error ? outerErr : undefined,
        ...copyErrorMetadata(outerErr),
      })
    }
  }

  static async wrapAsync<T, E extends BaseError<MetadataObject, ErrorCauseType>>(
    this: new (
      message: string,
      options?: BaseErrorOptions<ErrorCauseType, MetadataObject>,
    ) => E,
    innerFn: () => Promise<T>,
    innerMessage: string,
    outerMessage: string,
  ): Promise<T> {
    try {
      try {
        return await innerFn()
      } catch (innerErr) {
        throw new this(innerMessage, {
          cause: innerErr instanceof Error ? innerErr : undefined,
          ...copyErrorMetadata(innerErr),
        })
      }
    } catch (outerErr) {
      throw new this(outerMessage, {
        cause: outerErr instanceof Error ? outerErr : undefined,
        ...copyErrorMetadata(outerErr),
      })
    }
  }

  /**
   * Deserialize a SerializedError object back into a BaseError instance
   */
  static fromJSON(data: SerializedError): BaseError<MetadataObject, ErrorCauseType> {
    const { message, name, code, category, metadata, cause } = data

    // IMPORTANT: Do NOT pass cause to constructor to avoid recursion issues
    const error = new BaseError(message, {
      code,
      category,
      metadata,
      // cause: undefined  // Explicitly NOT passed here
    })

    if (name && name !== "BaseError") {
      console.warn(
        `BaseError.fromJSON(): Reconstructing '${name}' as 'BaseError'. Use fromJSON() from error-registry.js for subclass recreation.`,
      )
    }

    // TODO: Reconstruct cause chain after error creation
    // This will be implemented once we decide on cause type handling (Error vs string)
    if (cause) {
      // For now, store serialized cause info as a comment
      // Will implement proper cause reconstruction in follow-up
    }

    return error
  }
}

// Test the different constructor overloads
const error1 = new BaseError("test error")
const error2 = new BaseError("test with cause", {
  cause: new Error("root cause"),
  metadata: { userId: 123 },
})
const error3 = new BaseError({
  cause: new TypeError("type error"),
  metadata: { action: "validation" },
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Safely converts a cause value to an Error instance
 * @private - Internal utility function
 */
function ensureErrorCause(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}

/**
 * Helper function to setup stack trace capture for errors
 * @private - Internal utility function
 */
function captureErrorStackTrace(targetObject: object, constructorOpt?: ErrorConstructorType): void {
  const ErrorClass = global.Error as typeof Error & {
    captureStackTrace?: (targetObject: object, constructorOpt?: ErrorConstructorType) => void
  }
  if (typeof ErrorClass.captureStackTrace === "function") {
    ErrorClass.captureStackTrace(targetObject, constructorOpt)
  }
}

/**
 * Helper function to copy metadata from BaseError instances or Error objects with attached properties
 */
export function copyErrorMetadata(sourceError: unknown): BaseErrorMetadataCopy {
  if (!sourceError || !isPlainObject(sourceError)) {
    return {}
  }

  if (sourceError instanceof BaseError) {
    return {
      code: sourceError.code,
      category: sourceError.category,
      metadata: sourceError.metadata ? deepCloneMetadata(sourceError.metadata) : undefined,
    }
  }

  // Handle regular Error objects that might have BaseError-like properties attached
  if (sourceError instanceof Error) {
    const err = sourceError as Error & Partial<Pick<BaseError, "code" | "category" | "metadata">>
    return {
      code: err.code,
      category: err.category,
      metadata: err.metadata ? deepCloneMetadata(err.metadata) : undefined,
    }
  }

  return {}
}

/**
 * Deep clones metadata objects to prevent reference sharing
 * @private - Internal utility function
 */
function deepCloneMetadata<T extends MetadataObject>(metadata: T): T {
  try {
    // Use structuredClone if available (modern environments)
    if (typeof structuredClone === "function") {
      return structuredClone(metadata)
    }

    // Fallback: JSON-based deep clone (handles most common cases)
    return JSON.parse(JSON.stringify(metadata)) as T
  } catch {
    // If cloning fails, return shallow copy as fallback
    return { ...metadata } as T
  }
}

/**
 * Helper function to serialize a single error cause
 * Useful utility for custom serialization implementations
 */
export function serializeErrorCause(
  cause: unknown,
): SerializedError | { name: string; message: string; stack?: string } | string {
  if (cause instanceof BaseError) {
    return cause.serialize()
  }
  if (cause instanceof Error) {
    // Preserve critical Error fields for non-BaseError Error instances
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    }
  }
  return String(cause)
}
