import { BaseError } from "@/errors"
import type { BaseErrorOptions, ErrorCauseType, MetadataObject } from "@/errors"

export interface CapabilityErrorMetadata extends MetadataObject {
  capabilityType?: string
  className?: string
}

export interface CapabilityErrorOptions<Cause extends ErrorCauseType = ErrorCauseType>
  extends BaseErrorOptions<Cause, CapabilityErrorMetadata> {}

/**
 * Error thrown when a capability is not properly bound or configured.
 * Used in BaseClass and other capability-aware classes.
 */
export class CapabilityError<
  Meta extends CapabilityErrorMetadata = CapabilityErrorMetadata,
  Cause extends ErrorCauseType = ErrorCauseType,
> extends BaseError<Meta, Cause> {
  public override name = "CapabilityError"

  constructor(message: string, options?: CapabilityErrorOptions<Cause> & { metadata?: Meta }) {
    super(message, {
      ...options,
      category: options?.category ?? "internal",
      code: options?.code ?? "CAPABILITY_ERROR",
      metadata: (options?.metadata ?? {}) as Meta,
    })
  }

  /**
   * Create an error for an unbound capability
   */
  static notBound<
    Meta extends CapabilityErrorMetadata = CapabilityErrorMetadata,
    T extends ErrorCauseType = ErrorCauseType,
  >(capabilityType: string, className?: string, cause?: T): CapabilityError<Meta, T> {
    return new CapabilityError(`${capabilityType} capability not bound`, {
      code: "CAPABILITY_NOT_BOUND",
      cause,
      metadata: { capabilityType, className } as Meta,
    })
  }

  /**
   * Create an error for an already bound capability
   */
  static alreadyBound<
    Meta extends CapabilityErrorMetadata = CapabilityErrorMetadata,
    T extends ErrorCauseType = ErrorCauseType,
  >(capabilityType: string, className?: string, cause?: T): CapabilityError<Meta, T> {
    return new CapabilityError(`${capabilityType} capability already bound`, {
      code: "CAPABILITY_ALREADY_BOUND",
      cause,
      metadata: { capabilityType, className } as Meta,
    })
  }

  /**
   * Create an error for an invalid capability configuration
   */
  static invalidConfiguration<
    Meta extends CapabilityErrorMetadata = CapabilityErrorMetadata,
    T extends ErrorCauseType = ErrorCauseType,
  >(capabilityType: string, reason: string, cause?: T): CapabilityError<Meta, T> {
    return new CapabilityError(`${capabilityType} capability configuration invalid: ${reason}`, {
      code: "CAPABILITY_INVALID_CONFIGURATION",
      cause,
      metadata: { capabilityType } as Meta,
    })
  }
}
