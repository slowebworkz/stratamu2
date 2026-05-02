// packages/capabilities/src/create-capabilities.ts
import type { Capabilities } from "./index.ts"

export function createCapabilities(options?: CapabilityOptions): Capabilities {
  return {
    events: createEventCapability(options),
    log: createLoggingCapability(options),
    metrics: createMetricsCapability(options),
  }
}
