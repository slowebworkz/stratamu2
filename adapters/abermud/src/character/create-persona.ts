import type { AberMUDPersona, AberMUDPersonaStore } from "../persistence/index.ts"

/** The two values AberMUD's `initme()` accepts for a newly created character. */
export type AberMUDSex = 0 | 1

/** Reproduces the new-persona defaults established by AberMUD's `initme()`. */
export async function createPersona(
  store: AberMUDPersonaStore,
  name: string,
  sex: AberMUDSex | undefined,
): Promise<AberMUDPersona> {
  if (sex === undefined) {
    throw new Error(`A new character "${name}" requires sex`)
  }

  const persona: AberMUDPersona = {
    name,
    score: 0,
    strength: 40,
    sex,
    level: 1,
  }

  await store.save(persona)
  return persona
}
