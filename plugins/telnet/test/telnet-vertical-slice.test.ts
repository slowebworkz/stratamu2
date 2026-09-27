import { mkdtemp, rm } from "node:fs/promises"
import { connect } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { AberMUDAdapter, FileAccountStore, FilePersonaStore } from "@stratamu/adapter-abermud"
import { Engine } from "@stratamu/engine-core"
import { entityId } from "@stratamu/primitives"
import { afterEach, describe, expect, it } from "vitest"

import { createLineServer, type LineServer } from "../src/index.ts"
import { runAberMUDLogin } from "./support/abermud-login.ts"
import { receiver } from "./support/receiver.ts"

const IAC = 255
const WILL = 251
const WONT = 252
const DONT = 254
const ECHO = 1
const TTYPE = 24

/**
 * The complete path this whole package exists to reach, in one connection: a real Telnet
 * client's own option negotiation, interleaved with the Name/Password exchange rather than
 * arriving neatly before or after it, followed by authentication, character control, and a game
 * command's rendered response -- all over one socket, with nothing in the test wiring the codec,
 * negotiator, decoder, or login flow together by hand. `createLineServer` already does that (see
 * the README); this test is what proves the result is actually one coherent path end to end,
 * not just each piece tested in isolation.
 */
describe("Telnet vertical slice: negotiation, login, and a game command together", () => {
  let server: LineServer | undefined
  let dir: string | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
      dir = undefined
    }
  })

  it("negotiates, logs in, and runs LOOK, with negotiation and login text interleaved in the same chunks", async () => {
    dir = await mkdtemp(join(tmpdir(), "stratamu-telnet-slice-"))
    const accountStore = new FileAccountStore(join(dir, "accounts.json"))
    const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
    await accountStore.create("alice", "secret")
    const adapter = new AberMUDAdapter({ accountStore, personaStore })
    const engine = new Engine(adapter)
    const here = entityId("here")
    adapter.rooms.set(here, {
      id: here,
      number: 1,
      name: "Here",
      description: "A small starting room.",
      exits: new Map(),
    })
    engine.world.add(Object.freeze({ id: here, type: "abermud.room" }))

    server = createLineServer(connection => {
      runAberMUDLogin({
        connection,
        engine,
        adapter,
        onLoggedIn: character => engine.world.locate(character, here),
      })
    })
    const port = await server.listen(0, "127.0.0.1")
    const socket = connect(port, "127.0.0.1")
    try {
      const { received, until } = receiver(socket)

      await until("Name: ")
      // A real client typically opens with its own option offers, not necessarily as a tidy
      // separate write: this one offers TTYPE (unsupported here) in the same chunk as the name,
      // proving the codec still finds the line even with negotiation bytes ahead of it.
      socket.write(Buffer.concat([Uint8Array.from([IAC, WILL, TTYPE]), Buffer.from("alice\r\n")]))
      await until("Password: ")
      // The refusal for the option this negotiator has no policy for reached the client, and
      // arrived before the exchange moved on to asking for a password.
      const ttypeRefused = received().indexOf(Buffer.from([IAC, DONT, TTYPE]))
      expect(ttypeRefused).toBeGreaterThan(-1)
      expect(received().indexOf(Buffer.from("Password: "))).toBeGreaterThan(ttypeRefused)

      socket.write("secret\r\n")
      await until("ready")
      // Echo was suppressed for the password and restored once authenticated, exactly as plain
      // login already covers -- the new thing this test adds is that it held even with the
      // TTYPE negotiation sharing the connection.
      const echoSuppressed = received().indexOf(Buffer.from([IAC, WILL, ECHO]))
      const echoRestored = received().indexOf(Buffer.from([IAC, WONT, ECHO]))
      expect(echoSuppressed).toBeGreaterThan(-1)
      expect(echoRestored).toBeGreaterThan(echoSuppressed)

      // Now ordinary game input, still on the same connection: negotiation and login are done,
      // and this is just a command.
      socket.write("look\r\n")
      await until("A small starting room.")
      expect(received().toString("utf8")).toContain("Here\nA small starting room.\r\n")
    } finally {
      socket.destroy()
    }
  })
})
