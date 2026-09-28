import type { EntityId } from "@stratamu/primitives"

/**
 * AberMUD's own object vocabulary. The historical `ob.in` format also carries flags such as
 * open/closed, locked/unlocked, lit/extinguished, and container -- none modeled here. Containers
 * (`put X in Y`, `get X from Y`) are still a deliberate architectural probe left for a later
 * slice. GET/DROP forced the first evidence, `takeable`; WIELD/WEAR/REMOVE forced the second and
 * third, `weaponDamage` and `wearable` -- built ahead of combat itself, deliberately: combat's
 * own damage formula reads the wielded weapon's damage and reduces to-hit for worn armor, so
 * nothing about combat is checkable without these existing first (see the package README).
 */
export interface AberObjectDefinition {
  readonly id: EntityId
  readonly name: string
  readonly description: string
  /** Whether GET can pick this object up. The inverse of AberMUD II's own object flag (recovered
   * source: `o_flannel`, checked by `obflannel()`/`oflannel()` in `mud/objsys.c` and
   * `mud/support.c` -- see the package README's "Reference"). Named for what it means here rather
   * than reusing that internal name. No carry-capacity limit is modeled yet (AberMUD's own
   * `cancarry()`, weight-based, is a separate, still-unmodeled rule): whether an object can be
   * taken at all is the only check this slice makes. */
  readonly takeable: boolean
  /** Whether WEAR will accept this object. The source's `canwear()` (`mud/new1.c`), a distinct
   * object flag from `takeable`/`weaponDamage` -- an object can be any combination of takeable,
   * wearable and a weapon independently, matching the source's own separate bits. */
  readonly wearable: boolean
  /** Present only if WIELD will accept this object as a weapon -- the source's `dambyitem()`
   * (`mud/blood.c`), which returns a per-object damage value only when the object has the weapon
   * flag set, and a fixed `4` for bare hands (`wpn === -1`) otherwise. `undefined` here means "not
   * a weapon", the same as `dambyitem` returning a negative value. */
  readonly weaponDamage?: number
}
