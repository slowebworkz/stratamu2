import type { AberMUDPersona } from "./persona.ts"
import type { UafRandLayout } from "./uaf-rand-codec.ts"
import { RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN } from "./uaf-rand-codec.ts"
import { UafRandFile } from "./uaf-rand-file.ts"

/** What SAVE needs from persistence, and what a future LOGIN would read back from. Deliberately
 * narrower than `UafRandFile`: no `delete` here, since no command needs one yet. */
export interface AberMUDPersonaStore {
  save(persona: AberMUDPersona): Promise<void>
  load(name: string): Promise<AberMUDPersona | undefined>
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
}
