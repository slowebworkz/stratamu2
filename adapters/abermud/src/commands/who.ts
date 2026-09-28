import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import type { PlayersOutput } from "../output.ts"
import { resolveActiveCharacter } from "./characters.ts"

export const who = workKind("abermud.who")

/** WHO: every currently-connected character, by name. */
export function registerWho(
  runtime: Runtime,
  control: Control,
  charactersByName: ReadonlyMap<string, EntityId>,
): void {
  runtime.handle(who, (task, context) => {
    const { session } = task.work.input as { session: Session | undefined }
    const online: string[] = []
    for (const name of charactersByName.keys()) {
      if (resolveActiveCharacter(name, charactersByName, control, context.sessions) !== undefined) {
        online.push(name)
      }
    }
    session?.send({ kind: "players", names: online } satisfies PlayersOutput)
  })
}
