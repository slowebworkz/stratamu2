import type { PrincipalId } from "@stratamu/primitives"

import type { AberMUDAccountStore } from "./account.ts"

/** Authenticates an AberMUD account and returns the principal to associate with a new Session. */
export async function authenticate(
  store: AberMUDAccountStore,
  name: string,
  password: string,
): Promise<PrincipalId | undefined> {
  return (await store.authenticate(name, password))?.principalId
}
