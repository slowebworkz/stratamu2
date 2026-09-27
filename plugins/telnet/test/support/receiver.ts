import type { Socket } from "node:net"

/**
 * Buffers everything a socket receives under one listener, and lets a test await a substring
 * appearing in it (optionally only after some earlier point, for asserting order). A second
 * listener per `until()` call -- rather than one shared here -- would double-count every chunk
 * that arrives once two are registered.
 *
 * Keeps the raw bytes, not just a UTF-8 decoding of them: a Telnet command's bytes (`IAC` is
 * `0xff`) aren't valid UTF-8 on their own, and decoding replaces them with U+FFFD, which loses
 * the exact byte values a test asserting on `IAC WILL ECHO` needs. `until`'s text search still
 * works against the decoded form, since the ASCII prompts around those bytes decode intact.
 *
 * `until` resolves with the position right after the match, in that decoded string, rather than
 * leaving a caller to read `received().length` afterwards: two writes close together (a
 * rejection message immediately followed by the next prompt, say) can arrive as one TCP chunk,
 * already containing what comes next by the time the match is found. The match's own end
 * position is unaffected by that; the buffer's length at resolve time is not.
 */
export function receiver(socket: Socket): {
  received(): Buffer
  until(text: string, from?: number): Promise<number>
} {
  let received = Buffer.alloc(0)
  let onData: () => void = () => {}
  socket.on("data", chunk => {
    received = Buffer.concat([received, chunk])
    onData()
  })
  return {
    received: () => received,
    until: (text, from = 0) =>
      new Promise<number>(resolve => {
        onData = () => {
          const index = received.toString("utf8").indexOf(text, from)
          if (index !== -1) {
            resolve(index + text.length)
          }
        }
        onData()
      }),
  }
}
