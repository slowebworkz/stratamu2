import { connect } from "node:net"

import { afterEach, describe, expect, it } from "vitest"

import { createLineServer, type LineServer, type TelnetCommand } from "../src/index.ts"

const IAC = 255
const DO = 253
const WILL = 251
const SB = 250
const SE = 240

describe("Telnet negotiation never reaching LineBuffer", () => {
  let server: LineServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  it("strips negotiation and subnegotiation out of what onLine sees", async () => {
    const lines: string[] = []
    const commands: TelnetCommand[] = []
    server = createLineServer(connection => {
      connection.onLine(line => lines.push(line))
      connection.onCommand(command => commands.push(command))
    })
    const port = await server.listen(0, "127.0.0.1")
    const socket = connect(port, "127.0.0.1")
    try {
      await new Promise<void>(resolve => socket.once("connect", resolve))
      socket.write(
        Buffer.from([
          ...Buffer.from("look"),
          IAC,
          DO,
          1, // negotiate an option mid-line
          ...Buffer.from(" here"),
          IAC,
          SB,
          24,
          1, // subnegotiation (TTYPE SEND)
          IAC,
          SE,
          ...Buffer.from("\r\n"),
          IAC,
          WILL,
          3,
          ...Buffer.from("north\n"),
        ]),
      )
      // The server processes each chunk as it arrives; nothing writes back over this socket, so
      // waiting for `lines` to fill is a short poll rather than a "data" event.
      const deadline = Date.now() + 2000
      while (lines.length < 2 && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    } finally {
      socket.destroy()
    }

    expect(lines).toEqual(["look here", "north"])
    expect(commands).toEqual([
      { kind: "do", option: 1 },
      { kind: "subnegotiation", option: 24, data: Uint8Array.from([1]) },
      { kind: "will", option: 3 },
    ])
  })
})
