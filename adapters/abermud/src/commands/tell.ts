import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal, type SpeechOutput } from "../output.ts"
import { resolveActiveCharacter } from "./characters.ts"
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
      session?.send(refusal("not-controlling"))
      return
    }
    const targetCharacter = resolveActiveCharacter(
      target,
      charactersByName,
      control,
      context.sessions,
    )
    if (targetCharacter === undefined) {
      session?.send(refusal("target-absent", target))
      return
    }
    const speaker = session?.principalId ?? actor
    session?.send({
      kind: "speech",
      channel: "tell",
      perspective: "speaker",
      speaker,
      text: message,
      addressee: target,
    } satisfies SpeechOutput)
    targetCharacter.session.send({
      kind: "speech",
      channel: "tell",
      perspective: "listener",
      speaker,
      text: message,
    } satisfies SpeechOutput)
  })
}
