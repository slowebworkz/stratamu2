import type { Session } from "@stratamu/engine-sessions"
import type { Work, WorkKind } from "@stratamu/work"
import { work } from "@stratamu/work"

import {
  drop,
  exits,
  get,
  inventory,
  look,
  move,
  quit,
  remove,
  resolveDirection,
  save,
  say,
  tell,
  wear,
  who,
  wield,
} from "./commands/index.ts"

/** What a real transport loop would have in hand for one line of session-originated input. */
export interface SessionInput {
  readonly session: Session
  readonly raw: string
}

/** Commands that take no argument beyond the session itself: every spelling of one maps straight
 * to its `WorkKind`. */
const simpleCommands: ReadonlyMap<string, WorkKind> = new Map([
  ["look", look],
  ["l", look],
  ["exits", exits],
  ["ex", exits],
  ["who", who],
  ["save", save],
  ["quit", quit],
  ["i", inventory],
  ["inv", inventory],
  ["inventory", inventory],
])

/** Commands that take one optional name, as the rest of the line after the verb -- a synonym
 * (GET/TAKE) is just two entries pointing at the same `handler`. */
const namedCommands: ReadonlyArray<{ readonly prefix: string; readonly handler: WorkKind }> = [
  { prefix: "get", handler: get },
  { prefix: "take", handler: get },
  { prefix: "drop", handler: drop },
  { prefix: "wield", handler: wield },
  { prefix: "wear", handler: wear },
  { prefix: "remove", handler: remove },
]

/**
 * `SessionInput -> AberMUD command interpretation -> Work[]`. This is the only place raw command
 * text is read; `commands/` never parses, it only handles the `Work` this produces.
 *
 * The command vocabulary recognized here is deliberately small -- see the package README's
 * "Compatibility scope" for which of these are confirmed AberMUD II behavior versus still needing
 * verification against the source. Anything not recognized produces no `Work` at all.
 *
 * SAY/TELL and movement stay their own explicit checks below, not entries in either table: their
 * argument grammar (a whole message; a target then a message; a direction word, possibly behind
 * GO/JUMP) is genuinely different from "one optional name", not a third table worth building for
 * three commands.
 */
export function parseAberMUD(input: SessionInput): readonly Work[] {
  const { session, raw } = input
  const command = raw.trim()
  const lower = command.toLowerCase()

  const simpleKind = simpleCommands.get(lower)
  if (simpleKind !== undefined) {
    return [work(simpleKind, { session })]
  }

  for (const { prefix, handler } of namedCommands) {
    if (lower === prefix || lower.startsWith(`${prefix} `)) {
      return [
        work(handler, {
          session,
          name: lower === prefix ? "" : command.slice(prefix.length + 1),
        }),
      ]
    }
  }

  if (lower.startsWith("say ")) {
    return [work(say, { session, message: command.slice(4) })]
  }
  if (lower.startsWith("tell ")) {
    const rest = command.slice(5)
    const separator = rest.indexOf(" ")
    if (separator === -1) {
      return []
    }
    return [
      work(tell, {
        session,
        target: rest.slice(0, separator),
        message: rest.slice(separator + 1),
      }),
    ]
  }

  const movementWord = lower.startsWith("go ")
    ? lower.slice(3)
    : lower.startsWith("jump ")
      ? lower.slice(5)
      : lower
  const direction = resolveDirection(movementWord)
  if (direction !== undefined) {
    return [work(move, { session, direction })]
  }

  return []
}
