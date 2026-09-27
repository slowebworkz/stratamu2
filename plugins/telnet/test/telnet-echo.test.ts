import { connect } from "node:net"

import { afterEach, describe, expect, it } from "vitest"

import { createLineServer, type LineServer } from "../src/index.ts"

const IAC = 255
const WILL = 251
const WONT = 252
const DONT = 254
const ECHO = 1

describe("Telnet ECHO negotiation over a real socket", () => {
  let server: LineServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  it("suppresses and restores the client's echo through Connection.setEcho", async () => {
    server = createLineServer(connection => {
      connection.setEcho(false)
      connection.onLine(() => connection.setEcho(true))
    })
    const port = await server.listen(0, "127.0.0.1")
    const socket = connect(port, "127.0.0.1")
    try {
      const suppressed = await new Promise<Buffer>(resolve => socket.once("data", resolve))
      expect([...suppressed]).toEqual([IAC, WILL, ECHO])

      const restored = new Promise<Buffer>(resolve => socket.once("data", resolve))
      socket.write("secret\r\n")
      expect([...(await restored)]).toEqual([IAC, WONT, ECHO])
    } finally {
      socket.destroy()
    }
  })

  it("refuses an option the client offers that this negotiator has no policy for", async () => {
    server = createLineServer(() => {})
    const port = await server.listen(0, "127.0.0.1")
    const socket = connect(port, "127.0.0.1")
    try {
      const reply = new Promise<Buffer>(resolve => socket.once("data", resolve))
      socket.write(Uint8Array.from([IAC, 251, 31])) // client offers WILL NAWS
      expect([...(await reply)]).toEqual([IAC, DONT, 31])
    } finally {
      socket.destroy()
    }
  })
})
