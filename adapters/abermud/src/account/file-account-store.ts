import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { promisify } from "node:util"

import { Base } from "@stratamu/base"
import { principalId } from "@stratamu/primitives"

import type { AberMUDAccount, AberMUDAccountStore } from "./account.ts"

const scrypt = promisify(scryptCallback)

const VERSION = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16

interface AccountRecord {
  readonly version: typeof VERSION
  readonly name: string
  readonly salt: string
  readonly hash: string
}

/**
 * Provisional account persistence for the adapter-local authentication slice.
 *
 * This is intentionally NOT described as an implementation of the historical `user_file`
 * format. The historical record layout and password algorithm remain unverified. This store
 * provides a local account/authentication boundary while that compatibility work remains open.
 */
export class FileAccountStore extends Base implements AberMUDAccountStore {
  constructor(private readonly file: string) {
    super()
  }

  async create(name: string, password: string): Promise<AberMUDAccount> {
    const normalizedName = normalizeName(name)
    validatePassword(password)

    const records = await this.readRecords()

    if (records.some(record => record.name === normalizedName)) {
      throw new Error(`Account "${name}" already exists`)
    }

    const salt = randomBytes(SALT_LENGTH)
    const hash = await derivePassword(password, salt)

    records.push({
      version: VERSION,
      name: normalizedName,
      salt: salt.toString("base64url"),
      hash: hash.toString("base64url"),
    })

    await this.writeRecords(records)

    this.log.info({ account: normalizedName }, "Account created")

    return account(normalizedName)
  }

  async authenticate(name: string, password: string): Promise<AberMUDAccount | undefined> {
    const normalizedName = normalizeName(name)
    const record = (await this.readRecords()).find(candidate => candidate.name === normalizedName)

    if (record === undefined) {
      this.log.debug({ account: normalizedName }, "Account authentication failed")
      return undefined
    }

    const salt = decodeBase64(record.salt, "salt")
    const expected = decodeBase64(record.hash, "hash")

    if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) {
      throw new Error(`Invalid credentials for account "${normalizedName}"`)
    }

    const actual = await derivePassword(password, salt)

    if (!timingSafeEqual(expected, actual)) {
      this.log.debug({ account: normalizedName }, "Account authentication failed")
      return undefined
    }

    this.log.debug({ account: normalizedName }, "Account authenticated")

    return account(normalizedName)
  }

  private async readRecords(): Promise<AccountRecord[]> {
    try {
      const text = await readFile(this.file, "utf8")
      const value: unknown = JSON.parse(text)

      if (!Array.isArray(value)) {
        throw new Error(`Invalid AberMUD account file "${this.file}"`)
      }

      return value.map(parseRecord)
    } catch (error) {
      if (isMissingFile(error)) {
        return []
      }

      throw error
    }
  }

  private async writeRecords(records: readonly AccountRecord[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })

    const temporaryFile = `${this.file}.tmp`

    await writeFile(temporaryFile, `${JSON.stringify(records, null, 2)}\n`, "utf8")

    await rename(temporaryFile, this.file)
  }
}

function account(name: string): AberMUDAccount {
  return {
    name,
    principalId: principalId(name),
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim().toLowerCase()

  if (normalized.length === 0) {
    throw new TypeError("An account name cannot be empty")
  }

  return normalized
}

function validatePassword(password: string): void {
  if (password.length === 0) {
    throw new TypeError("A password cannot be empty")
  }
}

async function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return (await scrypt(password, salt, KEY_LENGTH)) as Buffer
}

function parseRecord(value: unknown): AccountRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { version?: unknown }).version !== VERSION ||
    typeof (value as { name?: unknown }).name !== "string" ||
    typeof (value as { salt?: unknown }).salt !== "string" ||
    typeof (value as { hash?: unknown }).hash !== "string"
  ) {
    throw new Error("Invalid AberMUD account record")
  }

  const record = value as AccountRecord

  if (normalizeName(record.name) !== record.name) {
    throw new Error("Invalid AberMUD account record")
  }

  const salt = decodeBase64(record.salt, "salt")
  const hash = decodeBase64(record.hash, "hash")

  if (salt.length !== SALT_LENGTH || hash.length !== KEY_LENGTH) {
    throw new Error("Invalid AberMUD account record")
  }

  return record
}

function decodeBase64(value: string, field: string): Buffer {
  try {
    return Buffer.from(value, "base64url")
  } catch {
    throw new Error(`Invalid account ${field}`)
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
