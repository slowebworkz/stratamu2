import type { Connection } from "@stratamu/plugin-telnet"

/** A fake `Connection` -- no socket, no transport -- mirroring
 * `adapters/abermud/test/fixtures/login-connection.ts`'s `fakeLoginConnection` for the same
 * reason: letting a test observe what `close()`/`write()` were called with, and drive `onClose`
 * itself, without a real `net.Socket`. */
export interface FakeConnection extends Connection {
  readonly output: string[]
  readonly closeCalls: number
  /** Signals the connection ending, the way a real socket eventually would once `close()` is
   * called on it. */
  simulateClose(): void
}

export function fakeConnection(id = "connection-1"): FakeConnection {
  const output: string[] = []
  let closeCalls = 0
  let closeHandler: () => void = () => {}
  return {
    id,
    output,
    get closeCalls() {
      return closeCalls
    },
    onLine: () => {},
    onClose: handler => {
      closeHandler = handler
    },
    write: text => output.push(text),
    close: () => {
      closeCalls++
    },
    simulateClose: () => closeHandler(),
  }
}
