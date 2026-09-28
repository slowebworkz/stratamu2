/**
 * The minimal shape `runAberMUDLogin` needs from whatever carried a line to it: line-oriented
 * input and output, plus two things beyond that -- `setEcho`, for suppressing a client's local
 * echo around a password prompt, and `close`, for ending the connection once QUIT says to (see
 * `commands/quit.ts` and the `send` closure below). Declared here, in the adapter, rather than
 * imported from a transport package: this adapter has no dependency on any specific transport,
 * and a real Telnet `TelnetConnection` (`@stratamu/plugin-telnet`) already satisfies this shape
 * structurally, so none is needed. Any other line transport that can do the same works too.
 */
export interface AberMUDLoginConnection {
  readonly id: string
  /** Called once per complete line the client sends, without its terminator. */
  onLine(handler: (line: string) => void): void
  /** Called once when the connection ends, whichever side ended it. */
  onClose(handler: () => void): void
  /** Suppresses (`false`) or restores (`true`) the client's local echo, for the password prompt.
   * What produces this -- Telnet's ECHO option negotiation, or anything else -- is entirely the
   * transport's concern; this login flow only needs the capability to exist. */
  setEcho(active: boolean): void
  /** Sends text as given. Line endings are the caller's concern. */
  write(text: string): void
  /** Ends the connection. */
  close(): void
}
