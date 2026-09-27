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
const ECHO = 1

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

  it("ignores a line that arrives while authentication is still in flight", async () => {
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
      // Both lines in one write, so `LineBuffer` hands both to `onLine` synchronously, before
      // `adapter.authenticate("alice", "secret")` has any chance to resolve: without a guard for
      // this, "second" would still be read as stage "password" and start a second, concurrent
      // `authenticate` call with the wrong password. It must be dropped instead.
      socket.write("secret\r\nsecond\r\n")
      await until("ready")
      // Without the guard, "second" would still start its own `authenticate("alice", "second")`
      // call, concurrently with the real one -- and that call fails, but not necessarily before
      // "ready" for the real one already arrived. Waiting past "ready" gives that stray call
      // room to finish and write "Login incorrect." if the guard weren't there, rather than the
      // assertions below racing it and passing by accident.
      await new Promise(resolve => setTimeout(resolve, 100))

      const text = received().toString("utf8")
      expect(text).not.toContain("Login incorrect.")
      expect(text.split("ready").length - 1).toBe(1)
    } finally {
      socket.destroy()
    }
  })
})
