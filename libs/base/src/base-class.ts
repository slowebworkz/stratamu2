import type { ErrorCapability, LoggingCapability } from "@stratamu/capabilities"
import { createContextLogger, createErrorCapability } from "@stratamu/capabilities"

export abstract class Base {
  #log?: LoggingCapability
  #errors?: ErrorCapability

  protected get log(): LoggingCapability {
    this.#log ??= createContextLogger(this.constructor.name || "anonymous")

    return this.#log
  }

  protected get errors(): ErrorCapability {
    this.#errors ??= createErrorCapability()

    return this.#errors
  }
}
