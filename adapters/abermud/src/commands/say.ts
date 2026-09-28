import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { refusal, type SpeechOutput } from "../output.ts"
import { activeSessionsInRoom } from "./recipients.ts"
import { resolveActor } from "./look.ts"

export const say = workKind("abermud.say")

export function registerSay(runtime: Runtime, control: Control): void {
  runtime.handle(say, (task, context) => {
    const { session, message } = task.work.input as {
      session: Session | undefined
      message: string
    }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send(refusal("not-controlling"))
      return
    }
    const speaker = session?.principalId ?? actor
    session?.send({
      kind: "speech",
      channel: "say",
      perspective: "speaker",
      speaker,
      text: message,
    } satisfies SpeechOutput)

    const location = context.world?.locationOf(actor)
    if (location === undefined) {
      return
    }
    for (const recipient of activeSessionsInRoom(
      context.world,
      control,
      context.sessions,
      location,
      actor,
    )) {
      recipient.send({
        kind: "speech",
        channel: "say",
        perspective: "listener",
        speaker,
        text: message,
      } satisfies SpeechOutput)
    }
  })
}
