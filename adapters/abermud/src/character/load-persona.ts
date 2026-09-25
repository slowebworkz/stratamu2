import type { AberMUDPersona, AberMUDPersonaStore } from "../persistence/index.ts"
import { createPersona, type AberMUDSex } from "./create-persona.ts"

/** Loads an existing persisted AberMUD persona. */
export async function loadPersona(
  store: AberMUDPersonaStore,
  name: string,
): Promise<AberMUDPersona | undefined> {
  return store.load(name)
}

/** Loads an existing persona, or reproduces `initme()`'s new-persona path when none exists. */
export async function loadOrCreatePersona(
  store: AberMUDPersonaStore,
  name: string,
  sex: AberMUDSex | undefined,
): Promise<AberMUDPersona> {
  const existing = await loadPersona(store, name)
  if (existing !== undefined) {
    return existing
  }

  return createPersona(store, name, sex)
}
