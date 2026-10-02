import { connect, type Socket } from "node:net"

import { type Connection, createLineServer, type LineServer } from "@stratamu/plugin-telnet"
import { afterEach, describe, expect, it } from "vitest"

import type { RuntimeDriver } from "../src/runtime-driver.ts"
import { createShutdown } from "../src/shutdown.ts"

/** A `RuntimeDriver` double that does nothing -- this suite is about the real socket/connection
 * draining behavior `createShutdown` coordinates with `@stratamu/plugin-telnet`'s real
 * `LineServer`, not about the driver itself (see `runtime-driver.test.ts` for that). */
function noopDriver(): RuntimeDriver {
  return {
    start: () => {},
    stop: () => Promise.resolve(),
    kick: () => {},
  }
}

function openSocket(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => resolve(socket))
    socket.once("error", reject)
  })
}

function nextData(socket: Socket): Promise<string> {
  return new Promise(resolve => socket.once("data", chunk => resolve(chunk.toString("utf8"))))
}

function closed(socket: Socket): Promise<void> {
  return new Promise(resolve => socket.once("close", () => resolve()))
}

/** Polls instead of asserting immediately: a socket's "close" event and the server's own
 * bookkeeping around it (`LineServer`'s internal socket-count tracking, this test's own
 * `connection.onClose`) are separate listeners on that same event, so their relative order isn't
 * guaranteed -- confirmed by inspection against a real socket, not assumed. See
 * `adapters/abermud/test/login-flow.test.ts`'s own `waitFor` for the same reasoning. */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`)
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

describe("createShutdown against a real LineServer and sockets", () => {
  let server: LineServer | undefined
  const sockets: Socket[] = []

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.destroy()
    }
    await server?.close()
    server = undefined
  })

  it("writes the shutdown notice to a real connection, then closes it, and resolves", async () => {
    const connections = new Set<Connection>()
    let accepted: () => void = () => {}
    const serverSawConnection = new Promise<void>(resolve => {
      accepted = resolve
    })

    server = createLineServer(connection => {
      connections.add(connection)
      connection.onClose(() => connections.delete(connection))
      accepted()
    })
    const port = await server.listen(0, "127.0.0.1")

    const socket = await openSocket(port)
    sockets.push(socket)
    // Waits for the server's own "connection" acceptance, not just the client's "connect" -- the
    // two fire on unrelated sockets with no ordering guarantee between them (see
    // `plugins/telnet/test/line-server.test.ts`'s own note on this exact race).
    await serverSawConnection

    // Registered before shutdown starts: "close" only ever fires once, and it can happen as early
    // as during the `Promise.all` below, so a listener attached only afterward can miss it and
    // wait forever.
    const socketClosed = closed(socket)
    const shutdown = createShutdown({ server, driver: noopDriver(), connections })
    const [notice] = await Promise.all([nextData(socket), shutdown()])

    expect(notice).toContain("Server is shutting down")
    // The server only half-closes (`connection.close()` is `socket.end()`); Node's client socket
    // auto-completes the full close in response (default `allowHalfOpen: false`).
    await socketClosed
    await waitFor(() => connections.size === 0)
  })

  it("stops accepting new connections once shutdown has started", async () => {
    const connections = new Set<Connection>()
    server = createLineServer(connection => {
      connections.add(connection)
      connection.onClose(() => connections.delete(connection))
    })
    const port = await server.listen(0, "127.0.0.1")

    await createShutdown({ server, driver: noopDriver(), connections })()

    await expect(openSocket(port)).rejects.toThrow()
  })
})
