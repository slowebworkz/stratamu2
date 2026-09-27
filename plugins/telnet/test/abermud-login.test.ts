import { mkdtemp, rm } from "node:fs/promises"
import { connect, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { AberMUDAdapter, FileAccountStore, FilePersonaStore } from "@stratamu/adapter-abermud"
import { Engine } from "@stratamu/engine-core"
import { entityId } from "@stratamu/primitives"
import { afterEach, describe, expect, it } from "vitest"

import { createLineServer, type LineServer } from "../src/index.ts"
import { runAberMUDLogin } from "./support/abermud-login.ts"

const IAC = 255
const WILL = 251
const WONT = 252
const ECHO = 1

/** Buffers everything a socket receives under one listener, and lets a test await a substring
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
 * position is unaffected by that; the buffer's length at resolve time is not. */
function receiver(socket: Socket): {
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

describe("AberMUD login over Telnet", () => {
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

  async function fixture() {
    dir = await mkdtemp(join(tmpdir(), "stratamu-telnet-login-"))
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
    return { adapter, engine, here }
  }

  it("prompts for a name and a password, suppressing echo only for the password", async () => {
    const { adapter, engine } = await fixture()
    server = createLineServer(connection => {
      runAberMUDLogin({ connection, engine, adapter })
    })
    const port = await server.listen(0, "127.0.0.1")
    const socket = connect(port, "127.0.0.1")
    try {
      const { received, until } = receiver(socket)

      await until("Name: ")
      socket.write("alice\r\n")
      await until("Password: ")
      // Echo suppression brackets only the password prompt: WILL ECHO right after "Name: " was
      // answered, not before.
      expect(received().includes(Buffer.from([IAC, WILL, ECHO]))).toBe(true)

      socket.write("secret\r\n")
      await until("ready")
      expect(received().includes(Buffer.from([IAC, WONT, ECHO]))).toBe(true)
    } finally {
      socket.destroy()
    }
  })

  it("logs in and runs LOOK once authenticated", async () => {
    const { adapter, engine, here } = await fixture()
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
      socket.write("alice\r\n")
      await until("Password: ")
      socket.write("secret\r\n")
      await until("ready")
      socket.write("look\r\n")
      await until("A small starting room.")
      expect(received().toString("utf8")).toContain("Here\nA small starting room.\r\n")
    } finally {
      socket.destroy()
    }
  })

  it("reprompts for a name after a wrong password, then succeeds", async () => {
    const { adapter, engine } = await fixture()
    server = createLineServer(connection => {
      runAberMUDLogin({ connection, engine, adapter })
    })
    const port = await server.listen(0, "127.0.0.1")
    const socket = connect(port, "127.0.0.1")
    try {
      const { until } = receiver(socket)

      await until("Name: ")
      socket.write("alice\r\n")
      await until("Password: ")
      socket.write("wrong\r\n")
      // "Login incorrect." and the reprompt that follows it are written back to back, and can
      // arrive as one TCP chunk containing both -- `afterFailure` is where the first match
      // itself ended, not the buffer's length once that whole chunk has landed, so the second
      // "Name: " already in the same chunk still counts as after it.
      const afterFailure = await until("Login incorrect.")
      await until("Name: ", afterFailure)
      socket.write("alice\r\n")
      await until("Password: ", afterFailure)
      socket.write("secret\r\n")
      await until("ready", afterFailure)
    } finally {
      socket.destroy()
    }
  })
})
