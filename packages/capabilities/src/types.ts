// packages/capabilities/src/types.ts

export type EventCapability = unknown
export type LoggingCapability = unknown

export interface Capabilities {
  events: EventCapability
  log: LoggingCapability
}

/**
 * Factory function that creates a capability instance.
 * Zero-arg, side-effect free, and cheap until invoked.
 */
export type CapabilityFactory<T> = () => T

/**
 * Optional capability providers (factories) for lazy initialization.
 * Each factory is invoked only when the capability is first accessed.
 */
export interface CapabilityProviders {
  events?: CapabilityFactory<EventCapability>
  log?: CapabilityFactory<LoggingCapability>
}

export type CapabilityType = "log" | "events"
