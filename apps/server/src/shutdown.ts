import type { Connection, LineServer } from "@stratamu/plugin-telnet"

import type { RuntimeDriver } from "./runtime-driver.ts"

const SHUTDOWN_NOTICE = "\r\nServer is shutting down. Goodbye.\r\n"

/** Just enough of `Console` to log and warn -- not `Pick<Console, ...>` itself, whose overloaded
 * signatures a plain `{ log: vi.fn(), warn: vi.fn() }` test double can't structurally satisfy. */
export interface ShutdownLog {
  log(message: string): void
  warn(message: string): void
}

export interface ShutdownOptions {
  readonly server: LineServer
  readonly driver: RuntimeDriver
  /** Every connection currently open -- `main.ts` tracks this itself (see its own `onClose`
   * removal), the same way `LoginFlow` already tracks its own session's lifecycle. No change to
   * `@stratamu/engine-sessions` was needed for this: nothing here needs to resolve a `Session`
   * back to a principal or character, only to notify and close whatever is still connected. */
  readonly connections: ReadonlySet<Connection>
  /** How long to wait for every connection to actually end before giving up and logging a
   * warning, rather than hanging the process indefinitely on a client that never reads its
   * output or never ends its socket. Default 5000ms. */
  readonly drainTimeoutMs?: number
  readonly log?: ShutdownLog
}

/**
 * Builds the graceful-shutdown sequence `main.ts`'s `SIGINT`/`SIGTERM` handlers call, factored
 * out so it is unit-testable without sending real OS signals (see `test/shutdown.test.ts`).
 *
 * Order: stop accepting new connections, stop the runtime driver (so nothing destroys a socket
 * mid-step), notify and close every connection still open -- reusing each connection's own
 * `close()`, the same write-then-close ordering `LoginFlow`'s QUIT/KILL handling already
 * establishes, not reimplemented here -- then wait for them all to actually end, bounded by
 * `drainTimeoutMs`. No separate persistence flush step: every AberMUD store already writes
 * synchronously per command, so waiting for in-flight commands to finish (which closing a
 * connection only does once its own output, if any, has already been written) is sufficient.
 *
 * Returns a function rather than running immediately, and guards re-entry, so calling it from
 * both `SIGINT` and `SIGTERM` -- or from the same signal firing twice -- only runs it once.
 */
export function createShutdown(options: ShutdownOptions): () => Promise<void> {
  const { server, driver, connections, drainTimeoutMs = 5000, log = console } = options
  let shuttingDown: Promise<void> | undefined

  return () => {
    shuttingDown ??= (async () => {
      log.log("Shutting down...")

      // Resolves once every connection the server itself is tracking has ended -- exactly the
      // connections closed below, so this doubles as the "all drained" signal to race against
      // the timeout, with no separate per-connection bookkeeping needed.
      const stopped = server.stopAccepting()

      await driver.stop()

      for (const connection of connections) {
        connection.write(SHUTDOWN_NOTICE)
        connection.close()
      }

      const timedOut = Symbol("timed out")
      const result = await Promise.race([
        stopped.then(() => undefined),
        new Promise(resolve => setTimeout(() => resolve(timedOut), drainTimeoutMs)),
      ])
      if (result === timedOut) {
        log.warn(`Shutdown timed out after ${drainTimeoutMs}ms waiting for connections to close`)
      }
    })()
    return shuttingDown
  }
}
