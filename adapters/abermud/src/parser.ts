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

  if (lower === "look" || lower === "l") {
    return [work(look, { session })]
  }
  if (lower === "exits" || lower === "ex") {
    return [work(exits, { session })]
  }
  if (lower === "who") {
    return [work(who, { session })]
  }
  if (lower === "save") {
    return [work(save, { session })]
  }
  if (lower === "quit") {
    return [work(quit, { session })]
  }
  if (lower === "i" || lower === "inv" || lower === "inventory") {
    return [work(inventory, { session })]
  }
  if (lower === "get" || lower.startsWith("get ")) {
    return [work(get, { session, name: lower === "get" ? "" : command.slice(4) })]
  }
  if (lower === "take" || lower.startsWith("take ")) {
    return [work(get, { session, name: lower === "take" ? "" : command.slice(5) })]
  }
  if (lower === "drop" || lower.startsWith("drop ")) {
    return [work(drop, { session, name: lower === "drop" ? "" : command.slice(5) })]
  }
  if (lower === "wield" || lower.startsWith("wield ")) {
    return [work(wield, { session, name: lower === "wield" ? "" : command.slice(6) })]
  }
  if (lower === "wear" || lower.startsWith("wear ")) {
    return [work(wear, { session, name: lower === "wear" ? "" : command.slice(5) })]
  }
  if (lower === "remove" || lower.startsWith("remove ")) {
    return [work(remove, { session, name: lower === "remove" ? "" : command.slice(7) })]
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
