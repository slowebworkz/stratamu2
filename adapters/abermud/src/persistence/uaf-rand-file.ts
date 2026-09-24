import { mkdir, open, readFile } from "node:fs/promises"
import { dirname } from "node:path"

import type { AberMUDPersona } from "./persona.ts"
import type { UafRandLayout } from "./uaf-rand-codec.ts"
import { RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN, UafRandCodec } from "./uaf-rand-codec.ts"

interface Slot {
  readonly offset: number
  readonly record: Buffer
}

/**
 * Reproduces the observable record/file semantics of AberMUD's `uaf.rand` -- a fixed-record
 * binary file with slot reuse and in-place updates, not an append-only list rewritten on every
 * change -- per `mud/newuaf.c`'s `personactl()`/`putpers()`/`delpers()`. It does not reproduce
 * their actual I/O mechanics (`fseek`/`fread`/`fwrite` on one open handle); there is no
 * behavioral reason to, and this class reads the whole file per operation instead, which is fine
 * at `uaf.rand`'s real scale (at most a few dozen characters).
 *
 * The source has no separate "is this slot empty" check. `personactl()` scans records comparing
 * lowercased names; `putpers()` finds an empty slot to reuse by calling that exact same scan
 * with the name `""` (`personactl("",&s,PCTL_FIND)`). An empty slot's name genuinely *is* `""`
 * -- `delpers()` writes it that way (`strcpy(x.p_name,"")`) -- so this class does the same thing:
 * one matching function, no separate emptiness concept.
 */
export class UafRandFile {
  readonly #codec: UafRandCodec
  readonly #file: string

  constructor(file: string, layout: UafRandLayout = RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN) {
    this.#file = file
    this.#codec = new UafRandCodec(layout)
  }

  /** A case-insensitive scan for a persona by name, matching AberMUD's own comparison (it
   * lowercases both the requested and stored name before comparing). */
  async find(name: string): Promise<AberMUDPersona | undefined> {
    const match = await this.#findSlot(name)
    return match === undefined ? undefined : this.#codec.decode(match.record)
  }

  /**
   * Overwrites a matching record in place; reuses the first empty slot (a record named `""`) if
   * there is no match; otherwise appends a new record -- `putpers()`'s own order of preference.
   * Matching for "already has a record" is case-insensitive, but the supplied `persona.name` is
   * written verbatim: AberMUD compares lowercase copies but writes the name it was actually
   * given (`saveme()` passes the live, as-typed name), so `save("Alice")` then `find("alice")`
   * returns a persona still named `"Alice"`.
   */
  async save(persona: AberMUDPersona): Promise<void> {
    const slots = await this.#slots()
    const match = this.#matchingSlot(slots, persona.name)
    const reuse = match ?? this.#matchingSlot(slots, "")
    const offset = reuse?.offset ?? slots.length * this.#codec.recordSize

    await this.#writeAt(offset, this.#codec.encode(persona))
  }

  /**
   * Blanks every record matching this name (name cleared, level set to `-1`) in place rather
   * than removing it, so every other record keeps its offset -- `delpers()`'s own behavior,
   * looping until no more matches remain rather than assuming there is ever only one. A no-op
   * for a name with no record.
   */
  async delete(name: string): Promise<void> {
    let match = await this.#findSlot(name)
    while (match !== undefined) {
      const blank = this.#codec.encode({ name: "", score: 0, strength: 0, sex: 0, level: -1 })
      await this.#writeAt(match.offset, blank)
      match = await this.#findSlot(name)
    }
  }

  async #findSlot(name: string): Promise<Slot | undefined> {
    return this.#matchingSlot(await this.#slots(), name)
  }

  #matchingSlot(slots: readonly Slot[], name: string): Slot | undefined {
    const target = name.toLowerCase()
    return slots.find(slot => this.#codec.decode(slot.record).name.toLowerCase() === target)
  }

  async #slots(): Promise<Slot[]> {
    let buffer: Buffer
    try {
      buffer = await readFile(this.#file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return []
      }
      throw error
    }
    const size = this.#codec.recordSize
    const slots: Slot[] = []
    for (let offset = 0; offset + size <= buffer.length; offset += size) {
      slots.push({ offset, record: buffer.subarray(offset, offset + size) })
    }
    return slots
  }

  /** Writes one record at an exact byte offset without disturbing the rest of the file. Needs
   * `"r+"`, not `"a"`/`"a+"`: an append-mode handle ignores any explicit write position and
   * always writes at end-of-file, which would defeat in-place overwrite entirely. */
  async #writeAt(offset: number, record: Buffer): Promise<void> {
    await mkdir(dirname(this.#file), { recursive: true })
    const create = await open(this.#file, "a")
    await create.close()
    const handle = await open(this.#file, "r+")
    try {
      await handle.write(record, 0, record.length, offset)
    } finally {
      await handle.close()
    }
  }
}
