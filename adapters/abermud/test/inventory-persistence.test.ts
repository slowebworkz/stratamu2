import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { entityId, principalId } from "@stratamu/primitives"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FileInventoryStore, FilePersonaStore } from "../src/persistence/index.ts"
import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("inventory persistence", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "abermud-inventory-persistence-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe("FileInventoryStore", () => {
    it("saves and loads an inventory record", async () => {
      const store = new FileInventoryStore(join(dir, "inventory"))
      const sword = entityId("abermud.object:sword")
      await store.save({ name: "alice", inventory: [sword], worn: [], wielding: undefined })

      const loaded = await store.load("alice")
      expect(loaded).toMatchObject({
        name: "alice",
        inventory: [sword],
        worn: [],
        wielding: undefined,
      })
    })

    it("saves worn and wielding state", async () => {
      const store = new FileInventoryStore(join(dir, "inventory"))
      const sword = entityId("abermud.object:sword")
      const shield = entityId("abermud.object:shield")
      await store.save({
        name: "bob",
        inventory: [sword, shield],
        worn: [shield],
        wielding: sword,
      })

      const loaded = await store.load("bob")
      expect(loaded).toMatchObject({
        name: "bob",
        inventory: [sword, shield],
        worn: [shield],
        wielding: sword,
      })
    })

    it("returns undefined for a missing record", async () => {
      const store = new FileInventoryStore(join(dir, "inventory"))
      expect(await store.load("nobody")).toBeUndefined()
    })

    it("delete removes the record and subsequent load returns undefined", async () => {
      const store = new FileInventoryStore(join(dir, "inventory"))
      await store.save({ name: "carol", inventory: [], worn: [], wielding: undefined })
      await store.delete("carol")
      expect(await store.load("carol")).toBeUndefined()
    })

    it("delete is idempotent when no record exists", async () => {
      const store = new FileInventoryStore(join(dir, "inventory"))
      await expect(store.delete("nobody")).resolves.toBeUndefined()
    })

    it("overwrites an existing record on save", async () => {
      const store = new FileInventoryStore(join(dir, "inventory"))
      const sword = entityId("abermud.object:sword")
      await store.save({ name: "alice", inventory: [sword], worn: [], wielding: undefined })
      await store.save({ name: "alice", inventory: [], worn: [], wielding: undefined })
      const loaded = await store.load("alice")
      expect(loaded?.inventory).toHaveLength(0)
    })
  })

  describe("SAVE with inventory store", () => {
    it("persists carried items, worn set, and wielded weapon", async () => {
      const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
      const inventoryStore = new FileInventoryStore(join(dir, "inventory"))
      const { runtime, adapter, world, sword, shield, alicePlayer } = abermudFixture({
        personaStore,
        inventoryStore,
      })
      const session = testSession("session-1", "alice")

      world.locate(sword, alicePlayer)
      world.locate(shield, alicePlayer)
      adapter.worn.add(shield)
      adapter.wielding.set(alicePlayer, sword)

      for (const item of adapter.parse({ session, raw: "save" })) {
        runtime.submit({ work: item })
      }
      await runtime.drain()

      expect(session.output).toEqual([{ kind: "saved", name: "alice" }])

      const record = await inventoryStore.load("alice")
      expect(record).toBeDefined()
      expect(record?.inventory).toContain(sword)
      expect(record?.inventory).toContain(shield)
      expect(record?.worn).toEqual([shield])
      expect(record?.wielding).toBe(sword)
    })

    it("does not save inventory when no inventory store is configured", async () => {
      const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
      const inventoryStore = new FileInventoryStore(join(dir, "inventory"))
      const { runtime, adapter, world, sword, alicePlayer } = abermudFixture({ personaStore })
      const session = testSession("session-1", "alice")

      world.locate(sword, alicePlayer)

      for (const item of adapter.parse({ session, raw: "save" })) {
        runtime.submit({ work: item })
      }
      await runtime.drain()

      expect(session.output).toEqual([{ kind: "saved", name: "alice" }])
      expect(await inventoryStore.load("alice")).toBeUndefined()
    })
  })

  describe("QUIT with inventory store", () => {
    it("deletes the inventory record on quit so items are not restored on next login", async () => {
      const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
      const inventoryStore = new FileInventoryStore(join(dir, "inventory"))

      await inventoryStore.save({
        name: "alice",
        inventory: [entityId("sword")],
        worn: [],
        wielding: undefined,
      })

      const { runtime, adapter } = abermudFixture({ personaStore, inventoryStore })
      const session = testSession("session-1", "alice")

      for (const item of adapter.parse({ session, raw: "quit" })) {
        runtime.submit({ work: item })
      }
      await runtime.drain()

      expect(await inventoryStore.load("alice")).toBeUndefined()
    })
  })

  describe("login with inventory store — inventory restoration", () => {
    it("restores carried items, worn set, and wielded weapon on login", async () => {
      const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
      const inventoryStore = new FileInventoryStore(join(dir, "inventory"))
      await personaStore.save({ name: "carol", score: 0, strength: 40, sex: 0, level: 1 })

      const { world, adapter, sword, shield } = abermudFixture({ personaStore, inventoryStore })
      const session = testSession("session-carol", "carol")

      await inventoryStore.save({
        name: "carol",
        inventory: [sword, shield],
        worn: [shield],
        wielding: sword,
      })

      const character = await adapter.login(world, session, "carol")

      expect([...world.occupants(character)]).toContain(sword)
      expect([...world.occupants(character)]).toContain(shield)
      expect(adapter.worn.has(shield)).toBe(true)
      expect(adapter.wielding.get(character)).toBe(sword)
    })

    it("skips items that no longer exist in the world", async () => {
      const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
      const inventoryStore = new FileInventoryStore(join(dir, "inventory"))
      await personaStore.save({ name: "carol", score: 0, strength: 40, sex: 0, level: 1 })

      const { world, adapter, sword } = abermudFixture({ personaStore, inventoryStore })
      const session = testSession("session-carol", "carol")
      const ghost = entityId("abermud.object:nonexistent")

      await inventoryStore.save({
        name: "carol",
        inventory: [sword, ghost],
        worn: [],
        wielding: undefined,
      })

      const character = await adapter.login(world, session, "carol")

      expect([...world.occupants(character)]).toContain(sword)
      expect([...world.occupants(character)]).not.toContain(ghost)
    })

    it("does not restore worn or wielding for items missing from the world", async () => {
      const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
      const inventoryStore = new FileInventoryStore(join(dir, "inventory"))
      await personaStore.save({ name: "carol", score: 0, strength: 40, sex: 0, level: 1 })

      const { world, adapter } = abermudFixture({ personaStore, inventoryStore })
      const session = testSession("session-carol", "carol")
      const ghost = entityId("abermud.object:ghost-item")

      await inventoryStore.save({
        name: "carol",
        inventory: [ghost],
        worn: [ghost],
        wielding: ghost,
      })

      const character = await adapter.login(world, session, "carol")

      expect(adapter.worn.has(ghost)).toBe(false)
      expect(adapter.wielding.has(character)).toBe(false)
    })

    it("does nothing when no inventory store is configured", async () => {
      const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
      const inventoryStore = new FileInventoryStore(join(dir, "inventory"))
      await personaStore.save({ name: "carol", score: 0, strength: 40, sex: 0, level: 1 })
      await inventoryStore.save({
        name: "carol",
        inventory: [entityId("abermud.object:sword")],
        worn: [],
        wielding: undefined,
      })

      const { world, adapter } = abermudFixture({ personaStore })
      const session = testSession("session-carol", "carol")
      const character = await adapter.login(world, session, "carol")

      expect([...world.occupants(character)]).toHaveLength(0)
    })

    it("full round-trip: GET → WIELD → SAVE → logout → re-login restores state", async () => {
      const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
      const inventoryStore = new FileInventoryStore(join(dir, "inventory"))
      await personaStore.save({ name: "carol", score: 0, strength: 40, sex: 0, level: 1 })

      const { world, runtime, adapter, sword, here } = abermudFixture({
        personaStore,
        inventoryStore,
      })
      world.locate(sword, here)
      const session = testSession("session-carol", "carol")

      const character = await adapter.login(world, session, "carol")
      world.locate(character, here)

      // GET the sword
      for (const item of adapter.parse({ session, raw: "get sword" })) {
        runtime.submit({ work: item })
      }
      await runtime.drain()

      // WIELD the sword
      for (const item of adapter.parse({ session, raw: "wield sword" })) {
        runtime.submit({ work: item })
      }
      await runtime.drain()

      expect(adapter.wielding.get(character)).toBe(sword)

      // SAVE
      for (const item of adapter.parse({ session, raw: "save" })) {
        runtime.submit({ work: item })
      }
      await runtime.drain()

      // Simulate disconnect: remove control and clear in-memory inventory state
      adapter.control.delete(principalId("carol"))
      adapter.wielding.delete(character)
      // Move items back to room (as a disconnect would leave them)
      world.locate(sword, here)

      // Re-login: same adapter (charactersByName intact), loads state from stores
      const session2 = testSession("session-carol-2", "carol")
      const character2 = await adapter.login(world, session2, "carol")

      expect(character2).toBe(character)
      expect([...world.occupants(character2)]).toContain(sword)
      expect(adapter.wielding.get(character2)).toBe(sword)
    })
  })
})
