import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN,
  UafRandCodec,
  uafRandRecordSize,
} from "../src/persistence/uaf-rand-codec.ts"
import { UafRandFile } from "../src/persistence/uaf-rand-file.ts"

const RECORD_SIZE = uafRandRecordSize(RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN)
const codec = new UafRandCodec(RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN)

describe("UafRandFile", () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "abermud-uaf-rand-file-"))
    file = join(dir, "uaf.rand")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("reproduces a fresh makeuaf.c run's uaf.rand: one Debugger record", async () => {
    const debugger_ = { name: "Debugger", score: 0, strength: 100, sex: 0, level: 10033 }
    const uafRand = new UafRandFile(file)

    await uafRand.save(debugger_)

    expect(await uafRand.find("Debugger")).toEqual(debugger_)
    expect(readFileSync(file)).toHaveLength(RECORD_SIZE)
  })

  it("finds a persona case-insensitively", async () => {
    const uafRand = new UafRandFile(file)
    await uafRand.save({ name: "Alice", score: 0, strength: 10, sex: 0, level: 1 })

    expect(await uafRand.find("alice")).not.toBeUndefined()
    expect(await uafRand.find("ALICE")).not.toBeUndefined()
    expect(await uafRand.find("aLiCe")).not.toBeUndefined()
  })

  it("writes the name exactly as given, not lowercased, even though matching is case-insensitive", async () => {
    const uafRand = new UafRandFile(file)
    await uafRand.save({ name: "Alice", score: 0, strength: 10, sex: 0, level: 1 })

    expect((await uafRand.find("alice"))?.name).toBe("Alice")
  })

  it("returns undefined for an unknown character", async () => {
    const uafRand = new UafRandFile(file)
    await uafRand.save({ name: "alice", score: 0, strength: 0, sex: 0, level: 1 })

    expect(await uafRand.find("bob")).toBeUndefined()
  })

  it("returns undefined when the file does not exist yet", async () => {
    expect(await new UafRandFile(file).find("alice")).toBeUndefined()
  })

  it("overwrites a matching record in place rather than appending", async () => {
    const uafRand = new UafRandFile(file)
    await uafRand.save({ name: "alice", score: 100, strength: 10, sex: 0, level: 1 })
    await uafRand.save({ name: "Alice", score: 250, strength: 10, sex: 0, level: 2 })

    expect(readFileSync(file)).toHaveLength(RECORD_SIZE)
    expect(await uafRand.find("alice")).toEqual({
      name: "Alice",
      score: 250,
      strength: 10,
      sex: 0,
      level: 2,
    })
  })

  it("keeps multiple characters as independent records", async () => {
    const uafRand = new UafRandFile(file)
    await uafRand.save({ name: "alice", score: 100, strength: 10, sex: 0, level: 1 })
    await uafRand.save({ name: "bob", score: 50, strength: 12, sex: 1, level: 1 })

    expect(await uafRand.find("alice")).toEqual({
      name: "alice",
      score: 100,
      strength: 10,
      sex: 0,
      level: 1,
    })
    expect(await uafRand.find("bob")).toEqual({
      name: "bob",
      score: 50,
      strength: 12,
      sex: 1,
      level: 1,
    })
  })

  it("blanks a deleted record rather than removing it", async () => {
    const uafRand = new UafRandFile(file)
    await uafRand.save({ name: "alice", score: 0, strength: 0, sex: 0, level: 1 })
    await uafRand.save({ name: "bob", score: 0, strength: 0, sex: 0, level: 1 })

    await uafRand.delete("alice")

    expect(readFileSync(file)).toHaveLength(RECORD_SIZE * 2)
    expect(await uafRand.find("alice")).toBeUndefined()
    // bob's record kept its own offset -- deleting alice did not compact the file.
    expect(await uafRand.find("bob")).toEqual({
      name: "bob",
      score: 0,
      strength: 0,
      sex: 0,
      level: 1,
    })
  })

  it("blanks a deleted record with AberMUD's own exact shape: empty name, level -1", async () => {
    const uafRand = new UafRandFile(file)
    await uafRand.save({ name: "alice", score: 0, strength: 0, sex: 0, level: 1 })

    await uafRand.delete("alice")

    const record = readFileSync(file).subarray(0, RECORD_SIZE)
    expect(codec.decode(record)).toEqual({ name: "", score: 0, strength: 0, sex: 0, level: -1 })
  })

  it("blanks every matching record, not just the first -- delpers() loops rather than assuming one match", async () => {
    // Two "alice" records can only coexist via a raw write; save() itself never creates one.
    // delpers() defends against exactly this case (`l1: ... goto l1;`), so this proves the same
    // defense, not a scenario this class's own save() would ever produce on its own.
    const alice = { name: "alice", score: 0, strength: 0, sex: 0, level: 1 }
    await writeFile(file, Buffer.concat([codec.encode(alice), codec.encode(alice)]))

    await new UafRandFile(file).delete("alice")

    const records = readFileSync(file)
    expect(records).toHaveLength(RECORD_SIZE * 2)
    expect(codec.decode(records.subarray(0, RECORD_SIZE)).name).toBe("")
    expect(codec.decode(records.subarray(RECORD_SIZE)).name).toBe("")
  })

  it("is a no-op deleting a name with no record", async () => {
    const uafRand = new UafRandFile(file)
    await uafRand.save({ name: "alice", score: 0, strength: 0, sex: 0, level: 1 })

    await expect(uafRand.delete("bob")).resolves.toBeUndefined()
    expect(readFileSync(file)).toHaveLength(RECORD_SIZE)
  })

  it("reuses a deleted slot for a new persona instead of extending the file", async () => {
    const uafRand = new UafRandFile(file)
    await uafRand.save({ name: "alice", score: 0, strength: 0, sex: 0, level: 1 })
    await uafRand.save({ name: "bob", score: 0, strength: 0, sex: 0, level: 1 })
    await uafRand.delete("alice")

    await uafRand.save({ name: "carol", score: 0, strength: 0, sex: 0, level: 1 })

    // Still two records: carol took alice's freed slot rather than appending a third.
    expect(readFileSync(file)).toHaveLength(RECORD_SIZE * 2)
    expect(await uafRand.find("carol")).toEqual({
      name: "carol",
      score: 0,
      strength: 0,
      sex: 0,
      level: 1,
    })
    expect(await uafRand.find("bob")).not.toBeUndefined()
  })

  it("appends only once every existing slot is occupied", async () => {
    const uafRand = new UafRandFile(file)
    await uafRand.save({ name: "alice", score: 0, strength: 0, sex: 0, level: 1 })
    await uafRand.save({ name: "bob", score: 0, strength: 0, sex: 0, level: 1 })

    await uafRand.save({ name: "carol", score: 0, strength: 0, sex: 0, level: 1 })

    expect(readFileSync(file)).toHaveLength(RECORD_SIZE * 3)
  })
})
