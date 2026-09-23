import { TslogLogger } from "./tslog-logger.ts"
import type { LoggingCapability } from "./types.ts"

let root: LoggingCapability | undefined

/**
 * Sets the logger that every context logger is a child of. Call it once at startup, before any
 * object logs: loggers that were already created keep the root they were created from.
 */
export function setRootLogger(logger: LoggingCapability): void {
  root = logger
}

/** Creates a child of the root logger whose records carry `component`. */
export function createContextLogger(component: string): LoggingCapability {
  root ??= TslogLogger.create()

  return root.child({ component })
}
