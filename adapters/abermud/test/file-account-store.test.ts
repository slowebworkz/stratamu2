import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FileAccountStore } from "../src/account/index.ts"

describe("FileAccountStore", () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "abermud-file-account-store-"))
    file = join(dir, "accounts.json")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("creates an account and authenticates it through a fresh store instance", async () => {
    const account = await new FileAccountStore(file).create(" Alice ", "secret")

    expect(account.name).toBe("alice")
    expect(await new FileAccountStore(file).authenticate("ALICE", "secret")).toEqual(account)
  })

  it("rejects an incorrect password and an unknown account", async () => {
    await new FileAccountStore(file).create("alice", "secret")
    const store = new FileAccountStore(file)

    expect(await store.authenticate("alice", "wrong")).toBeUndefined()
    expect(await store.authenticate("bob", "secret")).toBeUndefined()
  })

  it("normalizes names and rejects duplicate normalized names", async () => {
    const store = new FileAccountStore(file)
    await store.create(" Alice ", "secret")

    await expect(store.create("ALICE", "another")).rejects.toThrow('Account "ALICE" already exists')
  })

  it("rejects empty names and passwords", async () => {
    const store = new FileAccountStore(file)

    await expect(store.create("   ", "secret")).rejects.toThrow("An account name cannot be empty")
    await expect(store.create("alice", "")).rejects.toThrow("A password cannot be empty")
  })

  it("serializes concurrent creates against the same file", async () => {
    const store = new FileAccountStore(file)

    const accounts = await Promise.all([
      store.create("alice", "secret-a"),
      store.create("bob", "secret-b"),
    ])

    expect(accounts.map(account => account.name)).toEqual(["alice", "bob"])

    const fresh = new FileAccountStore(file)
    expect(await fresh.authenticate("alice", "secret-a")).toEqual(accounts[0])
    expect(await fresh.authenticate("bob", "secret-b")).toEqual(accounts[1])
  })

  it("serializes concurrent creates from separate store instances", async () => {
    const first = new FileAccountStore(file)
    const second = new FileAccountStore(file)

    const accounts = await Promise.all([
      first.create("alice", "secret-a"),
      second.create("bob", "secret-b"),
    ])

    const fresh = new FileAccountStore(file)
    expect(await fresh.authenticate("alice", "secret-a")).toEqual(accounts[0])
    expect(await fresh.authenticate("bob", "secret-b")).toEqual(accounts[1])
  })

  it("writes the credential file with owner-only permissions", async () => {
    await new FileAccountStore(file).create("alice", "secret")

    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it("rejects malformed credential records", async () => {
    writeFileSync(
      file,
      JSON.stringify([
        {
          version: 1,
          name: "alice",
          salt: "not valid base64url!",
          hash: "AA",
        },
      ]),
    )

    await expect(new FileAccountStore(file).authenticate("alice", "secret")).rejects.toThrow(
      "Invalid account salt",
    )
  })

  it("uses canonical base64url encoding for persisted credentials", async () => {
    await new FileAccountStore(file).create("alice", "secret")
    const records = JSON.parse(readFileSync(file, "utf8")) as Array<{
      salt: string
      hash: string
    }>

    expect(records[0]?.salt).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(records[0]?.hash).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
