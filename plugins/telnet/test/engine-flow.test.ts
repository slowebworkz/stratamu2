import { mkdtemp, rm } from "node:fs/promises"
import { connect } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  type AberOutput,
  AberMUDAdapter,
  FileAccountStore,
  FilePersonaStore,
  renderOutput,
} from "@stratamu/adapter-abermud"
import { Engine } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import { entityId, sessionId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import { createLineServer } from "../src/index.ts"

/**
 * The full path over a real socket: bytes in -> Connection -> Engine.receive -> handler ->
 * AberOutput -> the session's send -> renderOutput -> bytes out. This test is the composition
 * that an app will eventually own; it lives here because no app exists yet. Login is not part of
 * it: the principal is authenticated up front and attached to the connection's session directly.
 */
describe("Telnet plugin with the AberMUD adapter", () => {
  it("runs LOOK from a socket and writes the rendered room back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stratamu-telnet-"))
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
    const principal = await adapter.authenticate("alice", "secret")

    const server = createLineServer(connection => {
      const session: Session = {
        id: sessionId(connection.id),
        principalId: principal,
        // The renderer lives on the session, so the engine and adapter never see the wire.
        send: message => connection.write(`${renderOutput(message as AberOutput)}\r\n`),
      }
      engine.sessions.open(session)
      void adapter.login(engine.world, session, "alice", 0).then(character => {
        engine.world.locate(character, here)
        connection.write("ready\r\n")
      })
      connection.onLine(raw => {
        engine.receive({ session, raw })
        // `receive` only submits; running the Runtime is the transport loop's job, so this
        // composition drains after each line.
        void engine.runtime.drain()
      })
      connection.onClose(() => {
        engine.sessions.disconnect(session.id)
      })
    })

    const port = await server.listen(0, "127.0.0.1")
    const socket = connect(port, "127.0.0.1")
    try {
      let received = ""
      let onData: () => void = () => {}
      socket.on("data", chunk => {
        received += chunk.toString("utf8")
        onData()
      })
      const until = (text: string) =>
        new Promise<void>(resolve => {
          onData = () => received.includes(text) && resolve()
          onData()
        })
      // Input that arrives before login finishes would find no character to act for, so wait
      // for the greeting first. Real login prompts are what will eventually gate this.
      await until("ready")
      socket.write("look\r\n")
      await until("A small starting room.")
      expect(received).toContain("Here\nA small starting room.\r\n")
    } finally {
      socket.destroy()
      await server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
