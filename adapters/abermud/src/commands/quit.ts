import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import { workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { principalControlling } from "../control.ts"
import { type QuitOutput, refusal } from "../output.ts"
import type { AberMUDPersona, AberMUDPersonaStore } from "../persistence/index.ts"
import { resolveActor } from "./look.ts"

/**
 * QUIT: leaves the game. Verified against `doaction()`'s case 8 in `mud/parse.c`, which calls
 * `dumpitems()` (every carried object relocated to the current room -- `dumpstuff(mynum,curch)`
 * in `mud/objsys.c`) and `saveme()` before ending the connection.
 *
 * What this deliberately does *not* reproduce: the source also clears the character's live name
 * and removes it from the room's own linked list (`closeworld()`), so it stops appearing to
 * other players immediately. This adapter leaves the character's `WorldState` location alone --
 * the same choice already made for an ordinary disconnect (see `runAberMUDLogin`'s `onClose`) --
 * so a character who quits remains visible to LOOK in the room they left from until someone logs
 * back in as them. `WHO` is unaffected either way, since it already filters by active session,
 * not by whether a character is "controlling" something (see `who.ts`).
 *
 * Ending the connection is not this handler's job: it sends a `QuitOutput`, and the composition
 * that owns the actual transport connection (`login/abermud-login.ts`) is what watches for one
 * and closes it, the same boundary every other command already respects.
 */
export const quit = workKind("abermud.quit")

export function registerQuit(
  runtime: Runtime,
  control: Control,
  personas: ReadonlyMap<EntityId, AberMUDPersona>,
  store: AberMUDPersonaStore | undefined,
): void {
  runtime.handle(quit, async (task, context) => {
    const { session } = task.work.input as { session: Session | undefined }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send(refusal("not-controlling"))
      return
    }

    const location = context.world?.locationOf(actor)
    if (location !== undefined) {
      const carried = [...(context.world?.occupants(actor) ?? [])]
      for (const id of carried) {
        context.world?.locate(id, location)
      }
    }

    const persona = personas.get(actor)
    if (store !== undefined && persona !== undefined) {
      await store.save(persona)
    }

    const actorName = session?.principalId ?? actor
    session?.send({ kind: "quit", perspective: "actor", name: actorName } satisfies QuitOutput)

    if (location === undefined) {
      return
    }
    for (const occupantId of context.world?.occupants(location) ?? []) {
      if (occupantId === actor) {
        continue
      }
      const principal = principalControlling(control, occupantId)
      if (principal === undefined) {
        continue
      }
      const recipient = context.sessions?.activeFor(principal)
      if (recipient === undefined) {
        continue
      }
      recipient.send({
        kind: "quit",
        perspective: "observer",
        name: actorName,
      } satisfies QuitOutput)
    }
  })
}
