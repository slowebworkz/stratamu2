import type { LoggingCapability } from "@repo/capabilities"
import { PinoLogger } from "@repo/capabilities"

export abstract class Base {
  static #root?: LoggingCapability

  #log?: LoggingCapability

  protected get log(): LoggingCapability {
    if (!this.#log) {
      Base.#root ??= PinoLogger.create()
      this.#log = Base.#root.child({ component: this.constructor.name || "anonymous" })
    }
    return this.#log
  }
}
