import type { Runtime } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { EntityId } from "@stratamu/primitives"
import type { Work } from "@stratamu/work"
import { work } from "@stratamu/work"

import type { Control } from "./control.ts"
import { principalControlling } from "./control.ts"
import type { Exits } from "./exits.ts"
import type { SessionInput } from "./session-input.ts"
import { look, move, say } from "./work-kinds.ts"

/**
 * The smallest contract that composes the already-proven pieces: not a `GameAdapter` interface
 * with `parseInput`/`registerCommands`/`createWorld`/`authorize`/... (the "god abstraction" the
 * architecture document explicitly warns against) but exactly the two capabilities five probes
 * already proved an adapter needs -- turning raw session input into `Work`, and supplying the
 * handlers that give each `WorkKind` its meaning -- plus the adapter-owned data (`control`,
 * `exits`) those two capabilities turned out to need. Nothing here is `EngineState`: `world` and
 * `sessions` are still supplied externally, by whoever composes a `Runtime` -- an adapter answers
 * "what kind of game is this", never "how does the engine execute it".
 *
 * `test.look`/`test.move`/`test.say` were duplicated, slightly differently each time, across
 * `session-boundary`, `player-control`, `world-movement`, `world-messaging` and
 * `session-lifecycle`. This is their one real, canonical implementation -- lifted out of five
 * places that each needed *some* Work to route through the engine, now genuinely owned here.
 */
export class TestAdapter {
  /** Who controls which entity. Adapter-owned: see `control.ts`. */
  readonly control: Control = new Map()
  /** Which direction leads where. Adapter-owned: see `exits.ts`. */
  readonly exits: Exits = new Map()

  /**
   * Raw session input -> zero, one, or more `Work`. Returns an empty array for input this
   * grammar does not recognize -- the same "no Work, so no output" outcome the session-boundary
   * probe proved, just expressed as an empty array instead of `undefined`, so a future input that
   * genuinely needs to produce more than one `Work` is not a breaking change to this signature.
   * Resolves the session's controlled actor here, once, from `control` -- unchanged by any of
   * this being real now: a session addressing its own output never needed a lookup, and neither
   * does resolving who it's speaking, saying or moving as.
   */
  parse(input: SessionInput): readonly Work[] {
    const { session, raw } = input
    const actor =
      session.principalId === undefined ? undefined : this.control.get(session.principalId)

    if (raw === "look") {
      return [work(look, { session, actor })]
    }
    if (raw.startsWith("say ")) {
      return [work(say, { session, actor, line: raw.slice(4) })]
    }
    if (raw.startsWith("move ")) {
      return [work(move, { session, actor, direction: raw.slice(5) })]
    }
    return []
  }

  /**
   * Supplies this adapter's `WorkHandler`s to a `Runtime`, using the registration mechanism
   * `Runtime` already has (`handle(kind, handler)`) -- no new engine concept was needed for this,
   * the same finding every probe already made about `TaskContext`. `Runtime` still only ever asks
   * "how do I execute this Work" (look up a handler, run it, interpret the result); every handler
   * here answers "what does this Work mean", and nothing outside this method needs to know that.
   */
  registerHandlers(runtime: Runtime): void {
    const { control, exits } = this

    runtime.handle(look, (task, context) => {
      const { session, actor } = task.work.input as {
        session: Session | undefined
        actor: EntityId | undefined
      }
      if (actor === undefined) {
        session?.send("you are not controlling anything")
        return
      }
      const self = context.world?.get(actor)
      session?.send(self === undefined ? "you do not exist" : `you are ${self.id}, a ${self.type}`)
    })

    runtime.handle(move, (task, context) => {
      const { session, actor, direction } = task.work.input as {
        session: Session | undefined
        actor: EntityId | undefined
        direction: string
      }
      if (actor === undefined) {
        session?.send("you are not controlling anything")
        return
      }
      // The movement rule: is there a valid destination from here, in this direction? An
      // ordinary check against adapter data, before WorldState is ever touched -- nothing about
      // it belongs in core. WorldState.locate refuses only a destination that does not exist
      // (data integrity); whether a move is allowed at all is entirely this handler's business.
      const currentRoom = context.world?.locationOf(actor)
      const destination =
        currentRoom === undefined ? undefined : exits.get(currentRoom)?.get(direction)
      if (destination === undefined) {
        session?.send("you cannot go that way")
        return
      }
      context.world?.locate(actor, destination)
      session?.send(`you go ${direction}`)
    })

    runtime.handle(say, (task, context) => {
      const { session, actor, line } = task.work.input as {
        session: Session | undefined
        actor: EntityId | undefined
        line: string
      }
      if (actor === undefined) {
        session?.send("you are not controlling anything")
        return
      }
      session?.send(`You say, "${line}"`)

      const location = context.world?.locationOf(actor)
      if (location === undefined) {
        return
      }
      const speaker = session?.principalId ?? actor
      const occupantIds = [...(context.world?.occupants(location) ?? [])]
      // Every other occupant, resolved in two real steps: an occupant's controlling principal
      // (control, adapter-owned), then that principal's active session, if any
      // (context.sessions, engine-owned). No MessageBus/EventBus/Broadcaster: this is still
      // exactly `for (const recipient of recipients) { recipient.send(...) }`.
      const recipients = occupantIds
        .filter(occupantId => occupantId !== actor)
        .map(occupantId => {
          const principal = principalControlling(control, occupantId)
          return principal === undefined ? undefined : context.sessions?.activeFor(principal)
        })
        .filter((recipient): recipient is Session => recipient !== undefined)
      for (const recipient of recipients) {
        recipient.send(`${speaker} says, "${line}"`)
      }
    })
  }
}
