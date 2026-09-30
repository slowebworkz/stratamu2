import { randomBytes } from "node:crypto"
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { Base } from "@stratamu/base"
import { isArrayWithEachItem, isNonEmptyString, isNonNullObject } from "@stratamu/guards"
import { entityId } from "@stratamu/primitives"

import type { AberMUDInventoryRecord, AberMUDInventoryStore } from "./inventory.ts"

const VERSION = 1

/** Per-character inventory JSON: { version, name, inventory, worn, wielding } */
interface InventoryFileRecord {
  readonly version: typeof VERSION
  readonly name: string
  readonly inventory: readonly string[]
  readonly worn: readonly string[]
  readonly wielding: string | null
}

/**
 * Persists a character's carried/worn/wielding state as a JSON file under `dir/<name>.json`.
 * One file per character; atomic write via temp-rename to avoid partial reads on crash.
 *
 * SAVE writes the record; QUIT deletes it (items were dumped into the room); LOGIN reads it back.
 * Items that no longer exist in the world at login time are silently skipped rather than erroring.
 */
export class FileInventoryStore extends Base implements AberMUDInventoryStore {
  constructor(private readonly dir: string) {
    super()
  }

  async save(record: AberMUDInventoryRecord): Promise<void> {
    const file = this.fileFor(record.name)
    const fileRecord: InventoryFileRecord = {
      version: VERSION,
      name: record.name.toLowerCase(),
      inventory: [...record.inventory],
      worn: [...record.worn],
      wielding: record.wielding ?? null,
    }
    const contents = `${JSON.stringify(fileRecord, null, 2)}\n`
    const tmp = `${file}.${randomBytes(16).toString("hex")}.tmp`
    try {
      await mkdir(this.dir, { recursive: true })
      await writeFile(tmp, contents, { encoding: "utf8", mode: 0o600 })
      await rename(tmp, file)
    } catch (error) {
      throw this.errors.from(error)
    } finally {
      await this.unlinkIfPresent(tmp)
    }
  }

  async load(name: string): Promise<AberMUDInventoryRecord | undefined> {
    const file = this.fileFor(name)
    try {
      const text = await readFile(file, "utf8")
      const value: unknown = JSON.parse(text)
      return this.parseRecord(value)
    } catch (error) {
      if (isMissingFile(error)) return undefined
      throw this.errors.from(error)
    }
  }

  async delete(name: string): Promise<void> {
    const file = this.fileFor(name)
    try {
      await unlink(file)
    } catch (error) {
      if (!isMissingFile(error)) {
        throw this.errors.from(error)
      }
    }
  }

  private fileFor(name: string): string {
    return join(this.dir, `${name.toLowerCase()}.json`)
  }

  private parseRecord(value: unknown): AberMUDInventoryRecord {
    const isEntityIdString = isNonEmptyString

    if (
      !isNonNullObject(value) ||
      value.version !== VERSION ||
      !isNonEmptyString(value.name) ||
      !isArrayWithEachItem(isEntityIdString)(value.inventory) ||
      !isArrayWithEachItem(isEntityIdString)(value.worn) ||
      !(value.wielding === null || value.wielding === undefined || isNonEmptyString(value.wielding))
    ) {
      throw this.errors.create("Invalid AberMUD inventory record")
    }

    return {
      name: value.name as string,
      inventory: (value.inventory as string[]).map(id => entityId(id)),
      worn: (value.worn as string[]).map(id => entityId(id)),
      wielding: value.wielding != null ? entityId(value.wielding as string) : undefined,
    }
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

function isMissingFile(error: unknown): boolean {
  return isNonNullObject(error) && "code" in error && error.code === "ENOENT"
}
