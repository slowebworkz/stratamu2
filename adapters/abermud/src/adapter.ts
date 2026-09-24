import type { EngineAdapter, Runtime } from "@stratamu/engine-core"
import type { EntityId } from "@stratamu/primitives"
import type { Work } from "@stratamu/work"

import {
  registerExits,
  registerLook,
  registerMove,
  registerSay,
  registerTell,
  registerWho,
} from "./commands/index.ts"
import type { Control } from "./control.ts"
import type { SessionInput } from "./parser.ts"
import { parseAberMUD } from "./parser.ts"
import type {
  AberMobileDefinition,
  AberObjectDefinition,
  AberRoomDefinition,
} from "./world/index.ts"

/**
 * The composition root for the AberMUD game adapter. Parsing lives in `parser.ts`; each
 * command's `Work` kind and handler live in `commands/`. This class only wires them together and
 * owns the adapter-local state parsing and command handlers both need: `charactersByName` (a
 * character's name), `control` (who plays whom), and AberMUD's own room/mobile/object
 * definitions -- none of it known to the generic engine.
 */
export class AberMUDAdapter implements EngineAdapter<SessionInput> {
  readonly control: Control = new Map()
  /** Character name (lower case) -> the `EntityId` it names. TELL and WHO resolve a name to a
   * character here, then `control` resolves that character to whoever plays it. */
  readonly charactersByName: Map<string, EntityId> = new Map()
  readonly rooms: Map<EntityId, AberRoomDefinition> = new Map()
  readonly mobiles: Map<EntityId, AberMobileDefinition> = new Map()
  readonly objects: Map<EntityId, AberObjectDefinition> = new Map()

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
  }
}
