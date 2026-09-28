import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FilePersonaStore } from "../src/persistence/index.ts"

/**
 * `FilePersonaStore` is a thin `AberMUDPersonaStore`-shaped wrapper over `UafRandFile`, which
 * owns all of `uaf.rand`'s actual behavior (slot reuse, blank-on-delete, case-insensitive
 * lookup) -- see `test/uaf-rand-file.test.ts` for that. These tests only prove the wrapper
 * delegates `save`/`load` correctly, through a fresh instance, the way a real process restart
 * would use it.
 */
describe("FilePersonaStore", () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "abermud-file-persona-store-"))
    file = join(dir, "uaf.rand")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("round-trips a saved persona through a fresh store instance", async () => {
    const persona = { name: "alice", score: 1200, strength: 14, sex: 0, level: 3 }
    await new FilePersonaStore(file).save(persona)

    expect(await new FilePersonaStore(file).load("alice")).toEqual(persona)
  })

  it("returns undefined for an unknown character", async () => {
    await new FilePersonaStore(file).save({
      name: "alice",
      score: 0,
      strength: 0,
      sex: 0,
      level: 1,
    })

    expect(await new FilePersonaStore(file).load("bob")).toBeUndefined()
  })

  it("preserves the case the persona was saved with", async () => {
    await new FilePersonaStore(file).save({
      name: "Alice",
      score: 0,
      strength: 0,
      sex: 0,
      level: 1,
    })

    expect((await new FilePersonaStore(file).load("alice"))?.name).toBe("Alice")
  })

  it("deletes a saved persona through a fresh store instance -- KILL's own permadeath", async () => {
    const store = new FilePersonaStore(file)
    await store.save({ name: "bob", score: 0, strength: -1, sex: 1, level: 1 })

    await new FilePersonaStore(file).delete("bob")

    expect(await new FilePersonaStore(file).load("bob")).toBeUndefined()
  })
})
