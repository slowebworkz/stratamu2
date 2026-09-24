import type { AberMUDPersona, AberMUDPersonaStore } from "../persistence/index.ts"
import { createPersona, type AberMUDSex } from "./create-persona.ts"

/** Loads an existing persona, or reproduces `initme()`'s new-persona path when none exists. */
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
