import { createServer, type Server, type Socket } from "node:net"
import { StringDecoder } from "node:string_decoder"

import { LineBuffer } from "./line-buffer.ts"

/**
 * One client connection, as everything above the transport sees it: lines in, text out. Nothing
 * here says what is on the wire, so an adapter's session, login flow or renderer can be written
 * against it without knowing about sockets.
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

export interface LineServer {
  /** Starts listening and resolves to the port actually bound (useful when `port` is 0). */
  listen(port: number, host?: string): Promise<number>
  close(): Promise<void>
}

/**
 * Raw TCP line transport: accepts connections and hands each one to `onConnection` as a
 * `Connection`. Deliberately not Telnet yet: no option negotiation, and IAC bytes pass through
 * untouched, so it works with `nc` but a real Telnet client's negotiation will show up as text.
 */
export function createLineServer(onConnection: (connection: Connection) => void): LineServer {
  let nextId = 1
  const sockets = new Set<Socket>()
  const server: Server = createServer(socket => {
    sockets.add(socket)
    const decoder = new StringDecoder("utf8")
    const lines = new LineBuffer()
    const lineHandlers: Array<(line: string) => void> = []
    const closeHandlers: Array<() => void> = []
    socket.on("data", chunk => {
      for (const line of lines.push(decoder.write(chunk))) {
        for (const handler of lineHandlers) {
          handler(line)
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
      onClose: handler => closeHandlers.push(handler),
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
