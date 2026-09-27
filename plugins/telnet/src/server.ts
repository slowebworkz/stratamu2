import { createServer, type Server, type Socket } from "node:net"
import { StringDecoder } from "node:string_decoder"

import { LineBuffer } from "./line-buffer.ts"
import { TelnetCodec, type TelnetCommand } from "./telnet-codec.ts"
import { TelnetNegotiator } from "./telnet-negotiator.ts"

/**
 * One client connection, as everything above the transport sees it: lines in, text out. Nothing
 * here says what is on the wire, so an adapter's session, login flow or renderer can be written
 * against it without knowing about sockets -- and nothing here says Telnet either. `setEcho` is a
 * Telnet-specific capability (see `TelnetConnection` below); a `Connection` on its own promises
 * only line-oriented input and output, the shape any line transport could offer.
 */
export interface Connection {
  readonly id: string
  /** Called once per complete line the client sends, without its terminator. */
  onLine(handler: (line: string) => void): void
  /** Called once when the connection ends, whichever side ended it. */
  onClose(handler: () => void): void
  /** Sends text as given. Line endings are the caller's concern. */
  write(text: string): void
  close(): void
}

/**
 * A `Connection` over Telnet specifically, adding the two things only Telnet's own protocol
 * makes possible: seeing the commands the wire carried, and controlling the client's echo.
 *
 * Telnet commands are parsed out before a line ever reaches `onLine` -- negotiation never mixes
 * with application text. Every command still reaches `onCommand`, but option negotiation is
 * already answered by a `TelnetNegotiator` before that: `onCommand` is for watching, not for
 * implementing another option, which belongs in the negotiator instead.
 */
export interface TelnetConnection extends Connection {
  /** Called once per Telnet command the client sends (a DO/DONT/WILL/WONT, a subnegotiation, or a
   * bare signal such as Go Ahead). Informational: see the interface note above. */
  onCommand(handler: (command: TelnetCommand) => void): void
  /** Suppresses or restores the client's local echo, for a password prompt. See
   * `TelnetNegotiator`. */
  setEcho(active: boolean): void
}

export interface LineServer {
  /** Starts listening and resolves to the port actually bound (useful when `port` is 0). */
  listen(port: number, host?: string): Promise<number>
  close(): Promise<void>
}

/**
 * Telnet transport: accepts connections and hands each one to `onConnection` as a
 * `TelnetConnection`. `TelnetCodec` sits between the socket and `LineBuffer`, so a client's
 * option negotiation is parsed out before it ever reaches application text, and a
 * `TelnetNegotiator` answers it: ECHO for `setEcho`, everything else refused per RFC 854 so a
 * real Telnet client's negotiation always gets a reply instead of hanging.
 */
export function createLineServer(onConnection: (connection: TelnetConnection) => void): LineServer {
  let nextId = 1
  const sockets = new Set<Socket>()
  const server: Server = createServer(socket => {
    sockets.add(socket)
    const decoder = new StringDecoder("utf8")
    const telnet = new TelnetCodec()
    const negotiator = new TelnetNegotiator(bytes => socket.write(Buffer.from(bytes)))
    const lines = new LineBuffer()
    const lineHandlers: Array<(line: string) => void> = []
    const commandHandlers: Array<(command: TelnetCommand) => void> = []
    const closeHandlers: Array<() => void> = []
    socket.on("data", (chunk: Buffer) => {
      for (const event of telnet.push(chunk)) {
        if (event.kind === "command") {
          negotiator.handle(event.command)
          for (const handler of commandHandlers) {
            handler(event.command)
          }
          continue
        }
        for (const line of lines.push(decoder.write(Buffer.from(event.bytes)))) {
          for (const handler of lineHandlers) {
            handler(line)
          }
        }
      }
    })
    // Socket errors (a reset, typically) are followed by "close"; handling them here keeps an
    // unhandled "error" event from taking the process down.
    socket.on("error", () => {})
    socket.on("close", () => {
      sockets.delete(socket)
      for (const handler of closeHandlers) {
        handler()
      }
    })
    onConnection({
      id: `connection-${nextId++}`,
      onLine: handler => lineHandlers.push(handler),
      onCommand: handler => commandHandlers.push(handler),
      onClose: handler => closeHandlers.push(handler),
      setEcho: active => negotiator.setEcho(active),
      write: text => {
        socket.write(text)
      },
      close: () => {
        socket.end()
      },
    })
  })

  return {
    listen: (port, host) =>
      new Promise((resolve, reject) => {
        server.once("error", reject)
        server.listen(port, host, () => {
          server.off("error", reject)
          const address = server.address()
          resolve(typeof address === "object" && address !== null ? address.port : port)
        })
      }),
    close: () =>
      new Promise(resolve => {
        for (const socket of sockets) {
          socket.destroy()
        }
        server.close(() => resolve())
      }),
  }
}
