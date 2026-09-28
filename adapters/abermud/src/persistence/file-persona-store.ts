import type { AberMUDPersona } from "./persona.ts"
import type { UafRandLayout } from "./uaf-rand-codec.ts"
import { RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN } from "./uaf-rand-codec.ts"
import { UafRandFile } from "./uaf-rand-file.ts"

/** What SAVE (and now KILL) need from persistence, and what a future LOGIN would read back from.
 * `delete` exists because death does: `bloodrcv()`'s `delpers(globme)` erases the loser's
 * `uaf.rand` record as part of dying -- permadeath, not a data-loss bug -- so KILL needed this the
 * same way SAVE needed `save`. */
export interface AberMUDPersonaStore {
  save(persona: AberMUDPersona): Promise<void>
  load(name: string): Promise<AberMUDPersona | undefined>
  delete(name: string): Promise<void>
}

/**
 * The real implementation for this slice: a thin adapter-facing wrapper over `UafRandFile`,
 * AberMUD's own `uaf.rand` semantics -- not an in-memory stand-in.
 */
export class FilePersonaStore implements AberMUDPersonaStore {
  readonly #file: UafRandFile

  constructor(file: string, layout: UafRandLayout = RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN) {
    this.#file = new UafRandFile(file, layout)
  }

  save(persona: AberMUDPersona): Promise<void> {
    return this.#file.save(persona)
  }

  load(name: string): Promise<AberMUDPersona | undefined> {
    return this.#file.find(name)
  }

  delete(name: string): Promise<void> {
    return this.#file.delete(name)
  }
}
