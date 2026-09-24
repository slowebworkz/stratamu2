import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { principalControlling } from "../control.ts"
import { resolveActor } from "./look.ts"

export const tell = workKind("abermud.tell")

/** TELL: a private message to a named character, resolved through `charactersByName` (name ->
 * `EntityId`) and then back through `Control`/`Sessions`. AberMUD players are addressed by
 * character name, not by `SessionId` or `PrincipalId`. */
export function registerTell(
  runtime: Runtime,
  control: Control,
  charactersByName: ReadonlyMap<string, EntityId>,
): void {
  runtime.handle(tell, (task, context) => {
    const { session, target, message } = task.work.input as {
      session: Session | undefined
      target: string
      message: string
    }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send("you are not controlling a character")
      return
    }
    const targetEntity = charactersByName.get(target.toLowerCase())
    const targetPrincipal =
      targetEntity === undefined ? undefined : principalControlling(control, targetEntity)
    const targetSession =
      targetPrincipal === undefined ? undefined : context.sessions?.activeFor(targetPrincipal)
    if (targetSession === undefined) {
      session?.send(`${target} is not here`)
      return
    }
    const speaker = session?.principalId ?? actor
    session?.send(`You tell ${target}, "${message}"`)
    targetSession.send(`${speaker} tells you, "${message}"`)
  })
}
