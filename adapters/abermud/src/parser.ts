import type { Session } from "@stratamu/engine-sessions"
import type { Work } from "@stratamu/work"
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

const simpleCommands = new Map([
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

const namedCommands = [
  ["get", get],
  ["take", get],
  ["drop", drop],
  ["wield", wield],
  ["wear", wear],
  ["remove", remove],
] as const

/**
 * `SessionInput -> AberMUD command interpretation -> Work[]`. This is the only place raw command
 * text is read; `commands/` never parses, it only handles the `Work` this produces.
 *
 * The command vocabulary recognized here is deliberately small -- see the package README's
 * "Compatibility scope" for which of these are confirmed AberMUD II behavior versus still needing
 * verification against the source. Anything not recognized produces no `Work` at all.
 */
export function parseAberMUD(input: SessionInput): readonly Work[] {
  const { session, raw } = input
  const command = raw.trim()
  const lower = command.toLowerCase()

  const simpleHandler = simpleCommands.get(lower)
  if (simpleHandler !== undefined) {
    return [work(simpleHandler, { session })]
  }

  for (const [prefix, handler] of namedCommands) {
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
