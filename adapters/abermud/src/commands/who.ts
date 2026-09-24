import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { principalControlling } from "../control.ts"

export const who = workKind("abermud.who")

/** WHO: every currently-connected character, by name. */
export function registerWho(
  runtime: Runtime,
  control: Control,
  charactersByName: ReadonlyMap<string, EntityId>,
): void {
  runtime.handle(who, (task, context) => {
    const { session } = task.work.input as { session: Session | undefined }
    const online = [...charactersByName.entries()]
      .filter(([, entity]) => {
        const principal = principalControlling(control, entity)
        return principal !== undefined && context.sessions?.activeFor(principal) !== undefined
      })
      .map(([name]) => name)
    session?.send(online.length === 0 ? "no one else is online" : `online: ${online.join(", ")}`)
  })
}
