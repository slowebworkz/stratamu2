import { DEV_MODE } from "@/env"
import type { BaseErrorOptions, ErrorCauseType, MetadataObject } from "@/errors"
import { BaseError } from "@/errors"

export interface ListenerErrorOptions<Cause extends ErrorCauseType = ErrorCauseType>
  extends BaseErrorOptions<Cause> {}

export class ListenerError<
  Meta extends MetadataObject = MetadataObject,
  Cause extends ErrorCauseType = ErrorCauseType,
> extends BaseError<Meta, Cause> {
  // ============================================================================
  // PUBLIC PROPERTIES
  // ============================================================================

  public override name = "ListenerError"

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor(options?: ListenerErrorOptions<Cause> & { metadata?: Meta }) {
    super("Listener execution failed", {
      ...options,
      category: options?.category ?? "logic",
      code: options?.code ?? "LISTENER_EXECUTION_ERROR",
      metadata: (options?.metadata ?? {}) as Meta,
    })
  }

  // ============================================================================
  // STATIC HELPER
  // ============================================================================

  public static throwIfDev(error: ListenerError): void {
    // 5️⃣ Re-throw in development mode
    if (DEV_MODE) throw error
  }
}
