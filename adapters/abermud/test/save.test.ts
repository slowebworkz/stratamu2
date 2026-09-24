import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FilePersonaStore } from "../src/persistence/index.ts"
import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

describe("SAVE", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "abermud-save-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("persists the controlling character's persona", async () => {
    const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
    const { runtime, adapter } = abermudFixture({ personaStore })
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "save" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual(["Saving alice"])
    expect(await personaStore.load("alice")).toEqual({
      name: "alice",
      score: 0,
      strength: 10,
      sex: 0,
      level: 1,
    })
  })

  it("says saving is not available without a configured store", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "save" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual(["saving is not available"])
  })

  it("says there is nothing to save for a character with no persona recorded", async () => {
    const personaStore = new FilePersonaStore(join(dir, "uaf.rand"))
    const { runtime, adapter, alicePlayer } = abermudFixture({ personaStore })
    adapter.personas.delete(alicePlayer)
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "save" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual(["you have no status to save"])
  })
})
