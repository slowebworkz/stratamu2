import { Engine } from "@stratamu/engine-core"
import { entityId } from "@stratamu/primitives"
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
})
