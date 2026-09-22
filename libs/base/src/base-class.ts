import type { LoggingCapability } from "@stratamu/capabilities"
import { createContextLogger } from "@stratamu/capabilities"

export abstract class Base {
  #log?: LoggingCapability

  protected get log(): LoggingCapability {
    this.#log ??= createContextLogger(this.constructor.name || "anonymous")

    return this.#log
  }
}
