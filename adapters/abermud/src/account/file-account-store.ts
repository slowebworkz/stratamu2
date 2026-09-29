import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { promisify } from "node:util"

import { Base } from "@stratamu/base"
import { principalId } from "@stratamu/primitives"

import type { AberMUDAccount, AberMUDAccountStore } from "./account.ts"

const scrypt = promisify(scryptCallback)

const VERSION = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16
const DUMMY_SALT = Buffer.alloc(SALT_LENGTH)

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
    const normalizedName = this.normalizeName(name)
    this.validatePassword(password)

    return withFileLock(this.file, async () => {
      const records = await this.readRecords()

      if (records.some(record => record.name === normalizedName)) {
        throw this.errors.create(`Account "${name}" already exists`)
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
    })
  }

  async authenticate(name: string, password: string): Promise<AberMUDAccount | undefined> {
    const normalizedName = this.normalizeName(name)
    this.validatePassword(password)

    const record = (await this.readRecords()).find(candidate => candidate.name === normalizedName)

    if (record === undefined) {
      await derivePassword(password, DUMMY_SALT)
      this.log.debug({ account: normalizedName }, "Account authentication failed")
      return undefined
    }

    const salt = this.decodeBase64(record.salt, "salt")
    const expected = this.decodeBase64(record.hash, "hash")

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
        throw this.errors.create(`Invalid AberMUD account file "${this.file}"`)
      }

      return value.map(value => this.parseRecord(value))
    } catch (error) {
      if (isMissingFile(error)) {
        return []
      }

      throw this.errors.from(error)
    }
  }

  private async writeRecords(records: readonly AccountRecord[]): Promise<void> {
    const temporaryFile = `${this.file}.${randomBytes(16).toString("hex")}.tmp`
    const contents = `${JSON.stringify(records, null, 2)}\n`

    try {
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(temporaryFile, contents, {
        encoding: "utf8",
        mode: 0o600,
      })
      await chmod(temporaryFile, 0o600)
      await rename(temporaryFile, this.file)
      await chmod(this.file, 0o600)
    } catch (error) {
      throw this.errors.from(error)
    } finally {
      await this.unlinkIfPresent(temporaryFile)
    }
  }

  private parseRecord(value: unknown): AccountRecord {
    if (
      typeof value !== "object" ||
      value === null ||
      (value as { version?: unknown }).version !== VERSION ||
      typeof (value as { name?: unknown }).name !== "string" ||
      typeof (value as { salt?: unknown }).salt !== "string" ||
      typeof (value as { hash?: unknown }).hash !== "string"
    ) {
      throw this.errors.create("Invalid AberMUD account record")
    }

    const record = value as AccountRecord

    if (this.normalizeName(record.name) !== record.name) {
      throw this.errors.create("Invalid AberMUD account record")
    }

    const salt = this.decodeBase64(record.salt, "salt")
    const hash = this.decodeBase64(record.hash, "hash")

    if (salt.length !== SALT_LENGTH || hash.length !== KEY_LENGTH) {
      throw this.errors.create("Invalid AberMUD account record")
    }

    return record
  }

  private normalizeName(name: string): string {
    const normalized = name.trim().toLowerCase()

    if (normalized.length === 0) {
      throw this.errors.create(new TypeError("An account name cannot be empty"))
    }

    return normalized
  }

  private validatePassword(password: string): void {
    if (password.length === 0) {
      throw this.errors.create(new TypeError("A password cannot be empty"))
    }
  }

  private decodeBase64(value: string, field: string): Buffer {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      throw this.errors.create(`Invalid account ${field}`)
    }

    const decoded = Buffer.from(value, "base64url")

    if (decoded.toString("base64url") !== value) {
      throw this.errors.create(`Invalid account ${field}`)
    }

    return decoded
  }

  private async unlinkIfPresent(file: string): Promise<void> {
    try {
      await unlink(file)
    } catch (error) {
      if (!isMissingFile(error)) {
        this.log.warn(
          { err: this.errors.from(error) },
          "Failed to remove temporary file during cleanup",
        )
      }
    }
  }
}

const fileLocks = new Map<string, Promise<void>>()

async function withFileLock<T>(file: string, action: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(file) ?? Promise.resolve()

  let release!: () => void

  const gate = new Promise<void>(resolve => {
    release = resolve
  })

  const current = previous.then(() => gate)
  fileLocks.set(file, current)

  await previous

  try {
    return await action()
  } finally {
    release()

    if (fileLocks.get(file) === current) {
      fileLocks.delete(file)
    }
  }
}

function account(name: string): AberMUDAccount {
  return {
    name,
    principalId: principalId(name),
  }
}

async function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return (await scrypt(password, salt, KEY_LENGTH)) as Buffer
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
