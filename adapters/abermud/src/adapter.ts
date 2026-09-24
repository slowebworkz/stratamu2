import type { EngineAdapter, Runtime } from "@stratamu/engine-core"
import type { EntityId } from "@stratamu/primitives"
import type { Work } from "@stratamu/work"

import {
  registerExits,
  registerLook,
  registerMove,
  registerSave,
  registerSay,
  registerTell,
  registerWho,
} from "./commands/index.ts"
import type { Control } from "./control.ts"
import type { SessionInput } from "./parser.ts"
import { parseAberMUD } from "./parser.ts"
import type { AberMUDPersona, AberMUDPersonaStore } from "./persistence/index.ts"
import type {
  AberMobileDefinition,
  AberObjectDefinition,
  AberRoomDefinition,
} from "./world/index.ts"

/** Configuration for `AberMUDAdapter`. Everything is optional; SAVE tells the player saving
 * isn't available when no `personaStore` is given. */
export interface AberMUDAdapterOptions {
  readonly personaStore?: AberMUDPersonaStore
}

/**
 * The composition root for the AberMUD game adapter. Parsing lives in `parser.ts`; each
 * command's `Work` kind and handler live in `commands/`. This class only wires them together and
 * owns the adapter-local state parsing and command handlers both need: `charactersByName` (a
 * character's name), `control` (who plays whom), `personas` (a controlled character's live
 * score/strength/sex/level -- generic `WorldState`/`Entity` deliberately carry none of this),
 * and AberMUD's own room/mobile/object definitions -- none of it known to the generic engine.
 */
export class AberMUDAdapter implements EngineAdapter<SessionInput> {
  readonly control: Control = new Map()
  /** Character name (lower case) -> the `EntityId` it names. TELL and WHO resolve a name to a
   * character here, then `control` resolves that character to whoever plays it. */
  readonly charactersByName: Map<string, EntityId> = new Map()
  readonly rooms: Map<EntityId, AberRoomDefinition> = new Map()
  readonly mobiles: Map<EntityId, AberMobileDefinition> = new Map()
  readonly objects: Map<EntityId, AberObjectDefinition> = new Map()
  /** A controlled character's current persona -- where its score/strength/sex/level live while
   * it is actively played. SAVE persists whatever is recorded here; nothing populates it yet on
   * its own, so composing this adapter means seeding it directly, the same as `rooms`. */
  readonly personas: Map<EntityId, AberMUDPersona> = new Map()
  readonly #personaStore: AberMUDPersonaStore | undefined

  constructor(options: AberMUDAdapterOptions = {}) {
    this.#personaStore = options.personaStore
  }

  parse(input: SessionInput): readonly Work[] {
    return parseAberMUD(input)
  }

  registerHandlers(runtime: Runtime): void {
    registerLook(runtime, this.control, this.rooms)
    registerExits(runtime, this.control, this.rooms)
    registerMove(runtime, this.control, this.rooms)
    registerSay(runtime, this.control)
    registerTell(runtime, this.control, this.charactersByName)
    registerWho(runtime, this.control, this.charactersByName)
    registerSave(runtime, this.control, this.personas, this.#personaStore)
  }
}
