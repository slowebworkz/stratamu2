import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { principalControlling } from "../control.ts"
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
      session?.send("you are not controlling a character")
      return
    }
    session?.send(`You say, "${message}"`)

    const location = context.world?.locationOf(actor)
    if (location === undefined) {
      return
    }
    const speaker = session?.principalId ?? actor
    const occupantIds = [...(context.world?.occupants(location) ?? [])]
    const recipients = occupantIds
      .filter(occupantId => occupantId !== actor)
      .map(occupantId => principalControlling(control, occupantId))
      .filter(principal => principal !== undefined)
      .map(principal => context.sessions?.activeFor(principal))
      .filter((recipient): recipient is Session => recipient !== undefined)
    for (const recipient of recipients) {
      recipient.send(`${speaker} says, "${message}"`)
    }
  })
}
