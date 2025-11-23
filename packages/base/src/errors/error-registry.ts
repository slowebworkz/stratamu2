import { BaseError } from "@/errors"
import type {
  BaseErrorOptions,
  SerializedError,
  MetadataObject,
  ErrorCauseType,
  UnresolvedSerializedCause,
} from "@/errors"

/**
 * Flexible constructor interface that allows different metadata/cause types per error class
 *
 * This design supports custom error classes like:
 * ```typescript
 * class ValidationError extends BaseError<{ field: string }, Error> { ... }
 * class NetworkError extends BaseError<{ timeout: number }, HttpError> { ... }
 * ```
 *
 * Each can be registered despite having different generic parameters.
 */
interface BaseErrorConstructor<
  Meta extends MetadataObject = MetadataObject,
  Cause extends ErrorCauseType = ErrorCauseType,
> {
  new (message: string, options?: BaseErrorOptions<Cause, Meta>): BaseError<Meta, Cause>
}

/**
 * Enhanced error registry with validation, debugging, and safety features
 */
export class ErrorRegistry {
  private readonly registry = new Map<string, BaseErrorConstructor>()
  private readonly unresolvedCauses = new WeakMap<
    BaseError<MetadataObject, ErrorCauseType>,
    SerializedError | string
  >()

  /**
   * Register an error class in the registry
   */
  register(errorClass: BaseErrorConstructor): void {
    const name = errorClass.name

    if (this.registry.has(name)) {
      console.warn(`Error class '${name}' is already registered`)
      return
    }

    this.registry.set(name, errorClass)
  }

  /**
   * Attempt to register an error class without warnings
   *
   * @returns true if registered successfully, false if already exists
   */
  tryRegister(errorClass: BaseErrorConstructor): boolean {
    const name = errorClass.name

    if (this.registry.has(name)) {
      return false
    }

    this.registry.set(name, errorClass)
    return true
  }

  /**
   * Get an error constructor by name
   */
  get(name: string): BaseErrorConstructor | undefined {
    return this.registry.get(name)
  }

  /**
   * Check if an error class is registered
   */
  has(name: string): boolean {
    return this.registry.has(name)
  }

  /**
   * Get the number of registered error classes
   */
  get size(): number {
    return this.registry.size
  }

  /**
   * Get all registered error class names
   */
  getRegisteredNames(): string[] {
    return Array.from(this.registry.keys())
  }

  /**
   * Clear all registered error classes and unresolved causes
   */
  clear(): void {
    this.registry.clear()
    // Note: WeakMap doesn't have clear(), but unresolvedCauses will be
    // garbage collected when the error instances are no longer referenced
  }

  /**
   * Reconstruct a complete error instance from serialized data
   *
   * This is a complex domain operation that:
   * - Detects missing error classes and falls back gracefully
   * - Rebuilds objects using proper constructors
   * - Preserves unresolved cause chains in external storage
   * - Handles metadata type safety and validation
   *
   * @template Meta - The expected metadata type for type-safe reconstruction
   */
  reconstruct<Meta extends MetadataObject = MetadataObject>(
    data: SerializedError,
  ): BaseError<Meta, ErrorCauseType> {
    let ErrorClass = this.registry.get(data.name)

    // Fallback to BaseError if not registered
    if (!ErrorClass) {
      ErrorClass = BaseError as BaseErrorConstructor

      if (data.name !== "BaseError") {
        console.warn(
          `ErrorRegistry.reconstruct(): Reconstructing '${data.name}' as 'BaseError'. Register the error class to preserve type information.`,
        )
      }
    }

    // Create error without cause to avoid recursion
    // Use safe metadata fallback instead of forced casting
    // Falls back to empty object if metadata is null/undefined
    const error = new ErrorClass(data.message, {
      code: data.code,
      category: data.category,
      metadata: (data.metadata ?? {}) as Meta,
    })

    // Store unresolved cause externally to avoid polluting error instance
    if (data.cause) {
      this.unresolvedCauses.set(error, data.cause)
    }

    return error as BaseError<Meta, ErrorCauseType>
  }

  /**
   * Check if an error has unresolved serialized cause data
   *
   * Performance benefits over property inspection:
   * - O(1) WeakMap lookup vs string property access
   * - No false negatives from accidental undefined assignments
   * - No object property enumeration overhead
   */
  hasUnresolvedCause<Meta extends MetadataObject, Cause extends ErrorCauseType>(
    error: BaseError<Meta, Cause>,
  ): error is BaseError<Meta, Cause> & UnresolvedSerializedCause {
    return this.unresolvedCauses.has(error)
  }

  /**
   * Get the unresolved serialized cause from an error, if present
   */
  getUnresolvedCause<Meta extends MetadataObject, Cause extends ErrorCauseType>(
    error: BaseError<Meta, Cause>,
  ): SerializedError | string | undefined {
    return this.unresolvedCauses.get(error)
  }

  /**
   * Resolve one level of unresolved cause chain
   *
   * Attempts to reconstruct the direct cause of an error from its
   * unresolved serialized data. Returns undefined if no unresolved
   * cause exists or if the cause is a string (non-reconstructable).
   *
   * Note: This resolves only one level. The resolved cause may itself
   * have unresolved causes that can be resolved recursively.
   *
   * @param error - The error to resolve the cause for
   * @returns The reconstructed cause error, or undefined if not resolvable
   */
  resolveCause<Meta extends MetadataObject, Cause extends ErrorCauseType>(
    error: BaseError<Meta, Cause>,
  ): BaseError<MetadataObject, ErrorCauseType> | undefined {
    const unresolved = this.getUnresolvedCause(error)
    if (!unresolved || typeof unresolved === "string") {
      return undefined
    }
    return this.reconstruct(unresolved)
  }
}

// Create and export a default instance
export const errorRegistry = new ErrorRegistry()

// Export the functions for backward compatibility
export function register(errorClass: BaseErrorConstructor): void {
  errorRegistry.register(errorClass)
}

export function tryRegister(errorClass: BaseErrorConstructor): boolean {
  return errorRegistry.tryRegister(errorClass)
}

export function isRegistered(name: string): boolean {
  return errorRegistry.has(name)
}

export function getRegisteredNames(): string[] {
  return errorRegistry.getRegisteredNames()
}

export function reconstruct<Meta extends MetadataObject = MetadataObject>(
  data: SerializedError,
): BaseError<Meta, ErrorCauseType> {
  return errorRegistry.reconstruct<Meta>(data)
}

// Backward compatibility alias - prefer reconstruct() for new code
export function fromJSON<Meta extends MetadataObject = MetadataObject>(
  data: SerializedError,
): BaseError<Meta, ErrorCauseType> {
  return errorRegistry.reconstruct<Meta>(data)
}

export function hasUnresolvedCause<Meta extends MetadataObject, Cause extends ErrorCauseType>(
  error: BaseError<Meta, Cause>,
): error is BaseError<Meta, Cause> & UnresolvedSerializedCause {
  return errorRegistry.hasUnresolvedCause(error)
}

export function getUnresolvedCause<Meta extends MetadataObject, Cause extends ErrorCauseType>(
  error: BaseError<Meta, Cause>,
): SerializedError | string | undefined {
  return errorRegistry.getUnresolvedCause(error)
}

export function resolveCause<Meta extends MetadataObject, Cause extends ErrorCauseType>(
  error: BaseError<Meta, Cause>,
): BaseError<MetadataObject, ErrorCauseType> | undefined {
  return errorRegistry.resolveCause(error)
}

export function clear(): void {
  errorRegistry.clear()
}
