import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { entityId } from "@stratamu/primitives"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FilePersonaStore } from "../src/persistence/index.ts"
import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("AberMUD character login/load", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "abermud-login-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("loads an existing persona and establishes principal -> character control", async () => {
    const file = join(dir, "uaf.rand")
    const store = new FilePersonaStore(file)
    await store.save({ name: "carol", score: 1200, strength: 17, sex: 1, level: 4 })

    const { world, adapter } = abermudFixture({ personaStore: store })
    const session = testSession("session-1", "carol")

    const character = await adapter.login(world, session, "carol")

    expect(adapter.control.get(session.principalId!)).toBe(character)
    expect(adapter.charactersByName.get("carol")).toBe(character)
    expect(adapter.personas.get(character)).toEqual({
      name: "carol",
      score: 1200,
      strength: 17,
      sex: 1,
      level: 4,
    })
    expect(world.get(character)).toEqual({ id: character, type: "abermud.player" })
  })

  it("creates a new persona with initme() defaults when no record exists", async () => {
    const store = new FilePersonaStore(join(dir, "uaf.rand"))
    const { world, adapter } = abermudFixture({ personaStore: store })
    const session = testSession("session-1", "carol")

    const character = await adapter.login(world, session, "carol", 0)

    expect(adapter.personas.get(character)).toEqual({
      name: "carol",
      score: 0,
      strength: 40,
      sex: 0,
      level: 1,
    })
    expect(await store.load("carol")).toEqual({
      name: "carol",
      score: 0,
      strength: 40,
      sex: 0,
      level: 1,
    })
  })

  it("requires sex only when creating a new persona", async () => {
    const store = new FilePersonaStore(join(dir, "uaf.rand"))
    const { world, adapter } = abermudFixture({ personaStore: store })
    const session = testSession("session-1", "carol")

    await expect(adapter.login(world, session, "carol")).rejects.toThrow(
      'A new character "carol" requires sex',
    )
  })

  it("does not create a second character when the same principal logs in again", async () => {
    const store = new FilePersonaStore(join(dir, "uaf.rand"))
    await store.save({ name: "carol", score: 10, strength: 40, sex: 0, level: 1 })

    const { world, adapter } = abermudFixture({ personaStore: store })
    const session = testSession("session-1", "carol")

    const first = await adapter.login(world, session, "carol")
    const second = await adapter.login(world, session, "carol")

    expect(second).toBe(first)
    expect([...world.entities()]).toHaveLength(9)
  })

  it("preserves newer live persona state when the same principal logs in again", async () => {
    const store = new FilePersonaStore(join(dir, "uaf.rand"))
    await store.save({ name: "carol", score: 1200, strength: 17, sex: 1, level: 4 })

    const { world, adapter } = abermudFixture({ personaStore: store })
    const session = testSession("session-1", "carol")

    const character = await adapter.login(world, session, "carol")
    adapter.personas.set(character, { name: "carol", score: 1500, strength: 18, sex: 1, level: 4 })

    await adapter.login(world, session, "carol")

    expect(adapter.personas.get(character)).toEqual({
      name: "carol",
      score: 1500,
      strength: 18,
      sex: 1,
      level: 4,
    })
  })

  it("rejects an existing character when its persisted persona is missing", async () => {
    const store = new FilePersonaStore(join(dir, "uaf.rand"))
    const { world, adapter } = abermudFixture({ personaStore: store })

    // No login has ever created a persisted persona for "carol"; registering the character
    // directly (bypassing login) is the only way to reach this state, since login's own
    // character-creation path always persists a persona for what it registers.
    const character = entityId("abermud.player:carol")
    world.add(Object.freeze({ id: character, type: "abermud.player" }))
    adapter.charactersByName.set("carol", character)

    await expect(adapter.login(world, testSession("session-1", "carol"), "carol")).rejects.toThrow(
      'No persisted persona exists for character "carol"',
    )
  })

  it("rejects an attempt to take a character already controlled by another principal", async () => {
    const store = new FilePersonaStore(join(dir, "uaf.rand"))
    await store.save({ name: "carol", score: 10, strength: 40, sex: 0, level: 1 })

    const { world, adapter } = abermudFixture({ personaStore: store })
    await adapter.login(world, testSession("session-1", "dave"), "carol")

    await expect(adapter.login(world, testSession("session-2", "eve"), "carol")).rejects.toThrow(
      'Character "carol" is already controlled',
    )
  })

  it("requires an authenticated principal", async () => {
    const store = new FilePersonaStore(join(dir, "uaf.rand"))
    const { world, adapter } = abermudFixture({ personaStore: store })

    await expect(adapter.login(world, testSession("session-1"), "carol", 0)).rejects.toThrow(
      "Cannot initialize a character for an unauthenticated session",
    )
  })
})
