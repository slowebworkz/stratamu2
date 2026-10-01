import { connect, type Socket } from "node:net"
import { afterEach, describe, expect, it } from "vitest"

import { type Connection, createLineServer, type LineServer } from "../src/index.ts"

function open(port: number): Promise<Socket> {
  return new Promise(resolve => {
    const socket = connect(port, "127.0.0.1", () => resolve(socket))
  })
}

/** Unlike `open`, rejects on a connection error instead of hanging -- for asserting that a port
 * refuses a connection, which `open` has no way to observe. */
function attemptOpen(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => resolve(socket))
    socket.once("error", reject)
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

  it("stopAccepting refuses new connections", async () => {
    const port = await start(() => {})
    void server?.stopAccepting()
    await expect(attemptOpen(port)).rejects.toThrow()
  })

  it("stopAccepting resolves only once every existing connection has ended", async () => {
    // Waits for the server's own "connection" acceptance, not just the client's "connect" --
    // the two fire on unrelated sockets with no ordering guarantee between them, and calling
    // `stopAccepting` before the server side has registered the connection would race it.
    let onAccepted: () => void = () => {}
    const accepted = new Promise<void>(resolve => {
      onAccepted = resolve
    })
    const port = await start(onAccepted)
    const socket = await open(port)
    sockets.push(socket)
    await accepted

    const stopped = server?.stopAccepting()
    let settled = false
    void stopped?.then(() => {
      settled = true
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settled).toBe(false)

    socket.end()
    await stopped
    expect(settled).toBe(true)
  })
})
