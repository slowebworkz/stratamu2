import type { LoggingCapability } from "@repo/capabilities"
import { createContextLogger } from "@repo/capabilities"

export abstract class Base {
  #log?: LoggingCapability

  protected get log(): LoggingCapability {
    this.#log ??= createContextLogger(this.constructor.name || "anonymous")

    return this.#log
  }
}
