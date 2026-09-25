import type { AberMUDPersona, AberMUDPersonaStore } from "../persistence/index.ts"
import { createPersona, type AberMUDSex } from "./create-persona.ts"

/** Loads an existing persisted persona. Missing persistence is an error for an existing character. */
export async function loadPersona(
  store: AberMUDPersonaStore,
  name: string,
): Promise<AberMUDPersona> {
  const existing = await store.load(name)
  if (existing === undefined) {
    throw new Error(`No persisted persona exists for character "${name}"`)
  }
  return existing
}

/** Reproduces `initme()`'s new-persona path when no persisted persona exists. */
export async function loadOrCreatePersona(
  store: AberMUDPersonaStore,
  name: string,
  sex: AberMUDSex | undefined,
): Promise<AberMUDPersona> {
  const existing = await store.load(name)
  if (existing !== undefined) {
    return existing
  }

  return createPersona(store, name, sex)
}
