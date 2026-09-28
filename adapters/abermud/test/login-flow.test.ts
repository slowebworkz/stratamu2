import { Engine } from "@stratamu/engine-core"
import { entityId, type EntityId } from "@stratamu/primitives"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { FileAccountStore } from "../src/account/index.ts"
import { AberMUDAdapter } from "../src/adapter.ts"
import { runAberMUDLogin } from "../src/login/index.ts"
import { FilePersonaStore } from "../src/persistence/index.ts"
import { fakeLoginConnection } from "./fixtures/login-connection.ts"

/** Polls `predicate` instead of a fixed delay: `authenticate` does real, async file I/O, so how
 * long it takes depends on how busy the machine is -- a fixed wait long enough in isolation can
 * still be too short once the whole workspace's tests run in parallel. */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`)
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

/**
 * `runAberMUDLogin` itself, against a fake `AberMUDLoginConnection` -- no socket, no transport.
 * The real-socket proof that a `TelnetConnection` actually satisfies `AberMUDLoginConnection`,
 * and that negotiation coexists with the exchange, lives in `@stratamu/plugin-telnet`'s tests
 * instead (see its README): that's the seam worth a real socket, this is the login logic itself.
 */
describe("runAberMUDLogin", () => {
  let dir: string | undefined

  afterEach(async () => {
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
      dir = undefined
    }
  })

  async function fixture() {
    dir = await mkdtemp(join(tmpdir(), "stratamu-abermud-login-"))
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

  it("prompts for a name, then a password, suppressing echo only around the password", async () => {
    const { adapter, engine } = await fixture()
    const connection = fakeLoginConnection()
    runAberMUDLogin({ connection, engine, adapter })

    expect(connection.output).toEqual(["Name: "])
    connection.sendLine("alice")
    expect(connection.output).toEqual(["Name: ", "Password: "])
    expect(connection.echoCalls).toEqual([false])

    connection.sendLine("secret")
    await waitFor(() => connection.echoCalls.length === 2)
    expect(connection.echoCalls).toEqual([false, true])

    // The assertions above are done, but `authenticate`'s promise chain (session open, the
    // persona-store write inside `adapter.login`) keeps running after them. Waiting for "ready"
    // lets it finish before `afterEach` removes the temp directory -- otherwise that removal can
    // race an in-flight write there and fail with ENOTEMPTY, seen on CI (Linux) though never
    // reproduced locally (macOS), which is stricter about removing a directory mid-write.
    await waitFor(() => connection.output.includes("ready\r\n"))
  })

  it("logs in and runs a game command once authenticated", async () => {
    const { adapter, engine, here } = await fixture()
    const connection = fakeLoginConnection()
    let loggedInCharacter: string | undefined
    runAberMUDLogin({
      connection,
      engine,
      adapter,
      onLoggedIn: character => {
        loggedInCharacter = character
        engine.world.locate(character, here)
      },
    })

    connection.sendLine("alice")
    connection.sendLine("secret")
    await waitFor(() => connection.output.includes("ready\r\n"))
    expect(loggedInCharacter).toBeDefined()

    connection.sendLine("look")
    await waitFor(() => connection.output.at(-1) === "Here\nA small starting room.\r\n")
  })

  it("reprompts for a name after a wrong password, then succeeds", async () => {
    const { adapter, engine } = await fixture()
    const connection = fakeLoginConnection()
    runAberMUDLogin({ connection, engine, adapter })

    connection.sendLine("alice")
    connection.sendLine("wrong")
    await waitFor(() => connection.output.includes("Login incorrect.\r\n"))
    expect(connection.output).toEqual([
      "Name: ",
      "Password: ",
      "\r\n",
      "Login incorrect.\r\n",
      "Name: ",
    ])

    connection.sendLine("alice")
    connection.sendLine("secret")
    await waitFor(() => connection.output.includes("ready\r\n"))
  })

  it("drops a line that arrives while authentication is still in flight", async () => {
    const { adapter, engine } = await fixture()
    const connection = fakeLoginConnection()
    runAberMUDLogin({ connection, engine, adapter })

    connection.sendLine("alice")
    // Both sent synchronously, before `adapter.authenticate` has any chance to resolve: without
    // the "authenticating" stage guard, "second" would still be read as stage "password" and
    // start its own, concurrent `authenticate` call with the wrong password.
    connection.sendLine("secret")
    connection.sendLine("second")
    await waitFor(() => connection.output.includes("ready\r\n"))
    // "ready" appearing isn't enough on its own: the stray call this guards against resolves
    // independently and could still write a corrupting "Login incorrect." after it. There is
    // nothing to poll for an absence, so this grace period is a fixed wait, generous enough to
    // outlast the stray call even under a busy machine.
    await new Promise(resolve => setTimeout(resolve, 300))

    expect(connection.output).not.toContain("Login incorrect.\r\n")
    expect(connection.output.filter(line => line === "ready\r\n")).toHaveLength(1)
  })

  it("disconnects the session on close without removing the character's control", async () => {
    const { adapter, engine } = await fixture()
    const connection = fakeLoginConnection()
    runAberMUDLogin({ connection, engine, adapter })

    connection.sendLine("alice")
    connection.sendLine("secret")
    await waitFor(() => connection.output.includes("ready\r\n"))

    const principal = [...adapter.control.keys()][0]
    expect(principal).toBeDefined()
    const character = principal === undefined ? undefined : adapter.control.get(principal)

    connection.simulateClose()

    expect(
      principal === undefined ? undefined : engine.sessions.activeFor(principal),
    ).toBeUndefined()
    expect(principal === undefined ? undefined : adapter.control.get(principal)).toBe(character)
  })

  it("closes the connection once QUIT's own confirmation is sent, and only then", async () => {
    const { adapter, engine } = await fixture()
    const connection = fakeLoginConnection()
    runAberMUDLogin({ connection, engine, adapter })

    connection.sendLine("alice")
    connection.sendLine("secret")
    await waitFor(() => connection.output.includes("ready\r\n"))
    expect(connection.closeCalls).toBe(0)

    connection.sendLine("quit")
    await waitFor(() => connection.output.includes("Ok\r\n"))

    // This is the seam `commands/quit.ts` itself has no access to: sending a "quit" output
    // through the ordinary session channel is what actually ends the connection, and it happens
    // here, in the composition that owns `connection`, not in the handler.
    expect(connection.closeCalls).toBe(1)
  })

  it("closes the losing connection once KILL's own death output is sent, and only then", async () => {
    dir = await mkdtemp(join(tmpdir(), "stratamu-abermud-login-"))
    const accountStore = new FileAccountStore(join(dir, "accounts.json"))
    const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
    await accountStore.create("alice", "secret")
    await accountStore.create("bob", "secret")
    // A constant 0 guarantees every to-hit roll succeeds (any level's chance to hit is well
    // above 0); bob's own persona is set below strength to make the hit lethal regardless of
    // what the (also 0-rolled) damage happens to be.
    const adapter = new AberMUDAdapter({ accountStore, personaStore, rng: () => 0 })
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

    const aliceConnection = fakeLoginConnection("alice-connection")
    runAberMUDLogin({
      connection: aliceConnection,
      engine,
      adapter,
      onLoggedIn: character => engine.world.locate(character, here),
    })
    aliceConnection.sendLine("alice")
    aliceConnection.sendLine("secret")
    await waitFor(() => aliceConnection.output.includes("ready\r\n"))

    const bobConnection = fakeLoginConnection("bob-connection")
    let bobCharacter: EntityId | undefined
    runAberMUDLogin({
      connection: bobConnection,
      engine,
      adapter,
      onLoggedIn: character => {
        bobCharacter = character
        engine.world.locate(character, here)
      },
    })
    bobConnection.sendLine("bob")
    bobConnection.sendLine("secret")
    await waitFor(() => bobConnection.output.includes("ready\r\n"))

    if (bobCharacter !== undefined) {
      const persona = adapter.personas.get(bobCharacter)
      if (persona !== undefined) {
        adapter.personas.set(bobCharacter, { ...persona, strength: -1 })
      }
    }

    expect(bobConnection.closeCalls).toBe(0)
    aliceConnection.sendLine("kill bob")
    await waitFor(() => bobConnection.closeCalls === 1)

    // The same seam QUIT already proved, now for KILL's own forced disconnect: `commands/kill.ts`
    // never touches `connection`, only sends a `"killed"`, `"victim"` output through `Session`.
    expect(bobConnection.output.at(-1)).toContain("Oh dear")

    // The connection closing (asserted above) happens before the handler's own `await
    // store.delete(...)` -- sending output and returning from the handler are not the same
    // moment as the handler's promise settling. Poll for the deleted persona instead of a fixed
    // wait, the same reason `waitFor` exists at all: `afterEach` removes `dir` right after this
    // test returns, which would otherwise race the delete still landing on disk.
    const deadline = Date.now() + 2000
    let bobPersona = await personaStore.load("bob")
    while (bobPersona !== undefined && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 5))
      bobPersona = await personaStore.load("bob")
    }
    expect(bobPersona).toBeUndefined()
  })
})
