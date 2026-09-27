import { connect, type Socket } from "node:net"
import { afterEach, describe, expect, it } from "vitest"

import { type Connection, createLineServer, type LineServer } from "../src/index.ts"

function open(port: number): Promise<Socket> {
  return new Promise(resolve => {
    const socket = connect(port, "127.0.0.1", () => resolve(socket))
  })
}

function nextData(socket: Socket): Promise<string> {
  return new Promise(resolve => socket.once("data", chunk => resolve(chunk.toString("utf8"))))
}

describe("createLineServer", () => {
  let server: LineServer | undefined
  const sockets: Socket[] = []

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.destroy()
    }
    await server?.close()
    server = undefined
  })

  async function start(onConnection: (connection: Connection) => void): Promise<number> {
    server = createLineServer(onConnection)
    return server.listen(0, "127.0.0.1")
  }

  it("delivers each line a client sends, without its terminator", async () => {
    const lines: string[] = []
    const received = new Promise<void>(resolve => {
      void start(connection => {
        connection.onLine(line => {
          lines.push(line)
          if (lines.length === 2) {
            resolve()
          }
        })
      }).then(async port => {
        const socket = await open(port)
        sockets.push(socket)
        socket.write("look\r\nnor")
        socket.write("th\n")
      })
    })
    await received
    expect(lines).toEqual(["look", "north"])
  })

  it("writes text to the client exactly as given", async () => {
    const port = await start(connection => connection.write("hello\r\n"))
    const socket = await open(port)
    sockets.push(socket)
    expect(await nextData(socket)).toBe("hello\r\n")
  })

  it("reports when the client disconnects", async () => {
    let onClosed: () => void = () => {}
    const closed = new Promise<void>(resolve => {
      onClosed = resolve
    })
    const port = await start(connection => connection.onClose(onClosed))
    const socket = await open(port)
    socket.end()
    await closed
  })

  it("gives each connection its own id", async () => {
    const ids: string[] = []
    const port = await start(connection => ids.push(connection.id))
    sockets.push(await open(port), await open(port))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(new Set(ids).size).toBe(2)
  })
})
