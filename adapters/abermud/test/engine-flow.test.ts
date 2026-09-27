import { Engine } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import { entityId, type PrincipalId, principalId, sessionId } from "@stratamu/primitives"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { FileAccountStore } from "../src/account/index.ts"
import { AberMUDAdapter } from "../src/adapter.ts"
import { FilePersonaStore } from "../src/persistence/index.ts"

interface TestSession extends Session {
  readonly output: unknown[]
}

function testSession(id: string, principal: PrincipalId): TestSession {
  const output: unknown[] = []
  return {
    id: sessionId(id),
    principalId: principal,
    output,
    send(message) {
      output.push(message)
    },
  }
}

describe("AberMUD engine flow", () => {
  it("authenticates, opens a session, logs in a character, and executes LOOK through Engine", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stratamu-abermud-engine-"))

    try {
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
      expect(principal).toBe(principalId("alice"))
      if (principal === undefined) {
        throw new Error("expected authentication to succeed")
      }

      const session = testSession("session-1", principal)
      engine.sessions.open(session)

      const character = await adapter.login(engine.world, session, "alice", 0)
      engine.world.locate(character, here)

      expect(engine.sessions.activeFor(principal)).toBe(session)
      expect(adapter.control.get(principal)).toBe(character)

      engine.receive({ session, raw: "look" })
      await engine.runtime.drain()

      expect(session.output).toEqual([
        { kind: "room", name: "Here", description: "A small starting room.", occupants: [] },
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("disconnects the session without removing the principal's character control", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stratamu-abermud-engine-"))

    try {
      const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
      const adapter = new AberMUDAdapter({ personaStore })
      const engine = new Engine(adapter)
      const session = testSession("session-1", principalId("alice"))
      engine.sessions.open(session)

      const character = await adapter.login(engine.world, session, "alice", 0)
      const principal = principalId("alice")

      expect(engine.sessions.disconnect(session.id)).toBe(true)
      expect(engine.sessions.get(session.id)).toBeUndefined()
      expect(adapter.control.get(principal)).toBe(character)
      expect(engine.world.has(character)).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
