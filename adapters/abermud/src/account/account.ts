import type { PrincipalId } from "@stratamu/primitives"

/**
 * An authenticated AberMUD account. The account name is the adapter-facing login name; the
 * principal is the engine identity that survives reconnects and is handed to character login.
 */
export interface AberMUDAccount {
  readonly name: string
  readonly principalId: PrincipalId
}

export interface AberMUDAccountStore {
  create(name: string, password: string): Promise<AberMUDAccount>
  authenticate(name: string, password: string): Promise<AberMUDAccount | undefined>
}
