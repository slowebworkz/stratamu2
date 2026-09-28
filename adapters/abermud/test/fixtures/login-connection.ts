import type { AberMUDLoginConnection } from "../../src/login/index.ts"

/** A fake `AberMUDLoginConnection`, recording what `runAberMUDLogin` wrote and every `setEcho`
 * call, and letting a test feed it lines and a close directly -- no socket, no transport, just
 * what `runAberMUDLogin` itself actually calls. */
export interface FakeLoginConnection extends AberMUDLoginConnection {
  readonly output: string[]
  readonly echoCalls: boolean[]
  /** How many times `close()` was called -- QUIT's own effect on the connection, distinct from
   * `simulateClose()`, which represents the connection ending some other way. */
  readonly closeCalls: number
  /** Delivers one line, as if the client had sent it. */
  sendLine(line: string): void
  /** Signals the connection ending, the way an actual socket eventually would once `close()` is
   * called on it, or a client disconnects unprompted. */
  simulateClose(): void
}

export function fakeLoginConnection(id = "connection-1"): FakeLoginConnection {
  const output: string[] = []
  const echoCalls: boolean[] = []
  let closeCalls = 0
  let lineHandler: (line: string) => void = () => {}
  let closeHandler: () => void = () => {}
  return {
    id,
    output,
    echoCalls,
    get closeCalls() {
      return closeCalls
    },
    onLine: handler => {
      lineHandler = handler
    },
    onClose: handler => {
      closeHandler = handler
    },
    setEcho: active => echoCalls.push(active),
    write: text => output.push(text),
    close: () => {
      closeCalls++
      // A real socket's "close" event fires once the connection actually ends, asynchronously
      // relative to calling `close()`; simulated here as immediate, which is enough for what a
      // test needs to observe -- that ending the connection also disconnects the session.
      closeHandler()
    },
    sendLine: line => lineHandler(line),
    simulateClose: () => closeHandler(),
  }
}
