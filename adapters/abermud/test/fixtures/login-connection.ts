import type { AberMUDLoginConnection } from "../../src/login/index.ts"

/** A fake `AberMUDLoginConnection`, recording what `runAberMUDLogin` wrote and every `setEcho`
 * call, and letting a test feed it lines and a close directly -- no socket, no transport, just
 * what `runAberMUDLogin` itself actually calls. */
export interface FakeLoginConnection extends AberMUDLoginConnection {
  readonly output: string[]
  readonly echoCalls: boolean[]
  /** Delivers one line, as if the client had sent it. */
  sendLine(line: string): void
  /** Signals the connection ending. */
  simulateClose(): void
}

export function fakeLoginConnection(id = "connection-1"): FakeLoginConnection {
  const output: string[] = []
  const echoCalls: boolean[] = []
  let lineHandler: (line: string) => void = () => {}
  let closeHandler: () => void = () => {}
  return {
    id,
    output,
    echoCalls,
    onLine: handler => {
      lineHandler = handler
    },
    onClose: handler => {
      closeHandler = handler
    },
    setEcho: active => echoCalls.push(active),
    write: text => output.push(text),
    sendLine: line => lineHandler(line),
    simulateClose: () => closeHandler(),
  }
}
