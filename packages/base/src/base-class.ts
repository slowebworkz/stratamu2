// packages/base/src/base-class.ts

import type { CapabilityType, EventCapability, LoggingCapability } from "@repo/capabilities"
import { CapabilityError } from "@/errors"

// import { createCapabilities, type Capabilities } from "@repo/capabilities";

// import type { BaseEventMap } from "@repo/types"
// import { BubblingEmitter } from "@/events"

// const ERROR_MSG = "BaseClass cannot be instantiated directly"

// /**
//  * @abstract
//  * Abstract base class for event-driven classes.
//  *
//  * Provides structured logging, metrics, priority listeners,
//  * safe emission, event bubbling, and lifecycle management.
//  */
// export abstract class BaseClass<
//   EventMap extends BaseEventMap = BaseEventMap,
// > extends BubblingEmitter<EventMap> {
//   constructor() {
//     super()
//     BaseClass.ensureNotInstantiatedDirectly(new.target)
//   }

//   /**
//    * Throws or emits an error if this abstract base class is instantiated directly.
//    * Subclasses can override or extend this for custom instantiation guards.
//    */
//   protected static ensureNotInstantiatedDirectly(target: unknown): void {
//     if (target === BaseClass) {
//       BaseClass.prototype.log?.error?.({ class: BaseClass.name, shouldThrow: true }, ERROR_MSG)
//     }
//   }
// }

/**
 * @abstract
 * Abstract base class providing capability-based infrastructure.
 *
 * **RESERVED CAPABILITY NAMES:**
 * - `log` - Logging capability (reserved property name)
 * - `events` - Event emitter capability (reserved property name)
 *
 * **IMPORTANT:**
 * - Subclasses MUST NOT define methods or properties with these reserved names.
 * - Only infrastructure code should call `bindLog()` and `bindEvents()`.
 * - Application code should only access capabilities via the public getters.
 */
export abstract class BaseClass {
  /* ---------------- Private Fields ---------------- */

  /** The logging capability, bound by infrastructure code */
  private _log?: LoggingCapability

  /** The event emitter capability, bound by infrastructure code */
  private _events?: EventCapability

  /* ---------------- Protected Binding Methods ---------------- */

  /**
   * Binds the logging capability to this instance.
   *
   * **FOR INFRASTRUCTURE USE ONLY.**
   * Should only be called by framework/container initialization code.
   *
   * @param log - The logging capability implementation
   */
  protected bindLog(log: LoggingCapability): void {
    this._log ??= log
  }

  /**
   * Binds the event emitter capability to this instance.
   *
   * **FOR INFRASTRUCTURE USE ONLY.**
   * Should only be called by framework/container initialization code.
   *
   * @param events - The event emitter capability implementation
   */
  protected bindEvents(events: EventCapability): void {
    this._events ??= events
  }

  /**
   * Returns the class name for use in error metadata.
   */
  protected get className(): string {
    return this.constructor.name
  }

  /* ---------------- Public Capability Accessors ---------------- */

  /**
   * Access the logging capability.
   *
   * **RESERVED PROPERTY NAME** - Subclasses must not override.
   *
   * @throws {CapabilityError} If logging capability is not bound
   */
  public get log(): LoggingCapability {
    if (!this._log) {
      throw CapabilityError.notBound("log", this.className)
    }
    return this._log
  }

  /**
   * Access the event emitter capability.
   *
   * **RESERVED PROPERTY NAME** - Subclasses must not override.
   *
   * @throws {CapabilityError} If event capability is not bound
   */
  public get events(): EventCapability {
    if (!this._events) {
      throw CapabilityError.notBound("events", this.className)
    }
    return this._events
  }

  /* ---------------- Public Helpers ---------------- */

  /**
   * Check whether a capability is currently bound.
   *
   * @param capability - The capability type to check
   * @returns true if bound, false otherwise
   */
  public isCapabilityBound(capability: CapabilityType): boolean {
    return capability === "log" ? !!this._log : !!this._events
  }
}
