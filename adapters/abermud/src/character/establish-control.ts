import type { EntityId, PrincipalId } from "@stratamu/primitives"

import { principalControlling, type Control } from "../control.ts"

/** Establishes the AberMUD principal -> character control relationship. */
export function establishControl(
  control: Control,
  principal: PrincipalId,
  character: EntityId,
): void {
  const existing = control.get(principal)
  if (existing !== undefined && existing !== character) {
    throw new Error(`Principal "${principal}" already controls "${existing}"`)
  }

  const owner = principalControlling(control, character)
  if (owner !== undefined && owner !== principal) {
    throw new Error(`Character "${character}" is already controlled`)
  }

  control.set(principal, character)
}
