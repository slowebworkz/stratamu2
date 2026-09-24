/**
 * A character's persistent status, matching the fields of AberMUD II's own `struct uaf_being`
 * record: name, score, strength, sex, and level. Where these live while a character is actively
 * played is `AberMUDAdapter`'s own `personas` map; a `AberMUDPersonaStore` is only where SAVE
 * puts this record once computed, and where a future LOGIN would read it back from.
 */
export interface AberMUDPersona {
  readonly name: string
  readonly score: number
  readonly strength: number
  readonly sex: number
  readonly level: number
}
