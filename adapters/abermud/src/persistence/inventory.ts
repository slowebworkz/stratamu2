import type { EntityId } from "@stratamu/primitives"

export interface AberMUDInventoryRecord {
  readonly name: string
  readonly inventory: readonly EntityId[]
  readonly worn: readonly EntityId[]
  readonly wielding: EntityId | undefined
}

export interface AberMUDInventoryStore {
  save(record: AberMUDInventoryRecord): Promise<void>
  load(name: string): Promise<AberMUDInventoryRecord | undefined>
  delete(name: string): Promise<void>
}
