import type { EntityId } from "@stratamu/primitives"

/**
 * AberMUD's own object vocabulary. The historical `ob.in` format also carries flags such as
 * open/closed, locked/unlocked, lit/extinguished, worn, weapon, container, food and key -- none
 * modeled here. Equipment (`wear`) and containers (`put`) are still a deliberate architectural
 * probe left for a later slice; GET/DROP forced the first evidence, `takeable`.
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
}
