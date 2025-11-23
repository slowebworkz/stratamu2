import { BaseError } from "@/errors"
import { register } from "@/errors"
import type { BaseErrorOptions, ErrorCauseType, MetadataObject } from "@/errors"

export interface DomainErrorOptions<Cause extends ErrorCauseType = ErrorCauseType>
  extends BaseErrorOptions<Cause> {}

export class DomainError<
  Meta extends MetadataObject = MetadataObject,
  Cause extends ErrorCauseType = ErrorCauseType,
> extends BaseError<Meta, Cause> {
  // ============================================================================
  // PUBLIC PROPERTIES
  // ============================================================================

  public override name = "DomainError"

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor(message: string, options?: DomainErrorOptions<Cause> & { metadata?: Meta }) {
    super(message, {
      ...options,
      category: options?.category ?? "domain",
      code: options?.code ?? "DOMAIN_ERROR",
      metadata: (options?.metadata ?? {}) as Meta,
    })
  }

  // ============================================================================
  // STATIC FACTORY METHODS
  // ============================================================================

  /**
   * Create a validation error
   */
  static validation<
    Meta extends MetadataObject = MetadataObject,
    T extends ErrorCauseType = ErrorCauseType,
  >(message: string, field?: string, cause?: T): DomainError<Meta, T> {
    return new DomainError(message, {
      code: "DOMAIN_VALIDATION_ERROR",
      cause,
      metadata: field ? ({ field } as unknown as Meta) : undefined,
    })
  }

  /**
   * Create a business rule violation error
   */
  static businessRule<
    Meta extends MetadataObject = MetadataObject,
    T extends ErrorCauseType = ErrorCauseType,
  >(message: string, rule?: string, cause?: T): DomainError<Meta, T> {
    return new DomainError(`Business rule violation: ${message}`, {
      code: "DOMAIN_BUSINESS_RULE",
      cause,
      metadata: rule ? ({ rule } as unknown as Meta) : undefined,
    })
  }
}

// Auto-register DomainError for proper JSON reconstruction
register(DomainError)
