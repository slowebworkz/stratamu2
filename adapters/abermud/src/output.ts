import type { EntityId } from "@stratamu/primitives"

/**
 * What a character sees of the room they are in: a game fact, not wording. Occupants are entity
 * ids because `WorldState` holds no names yet; who resolves them to something displayable is an
 * open question (docs/OUTPUT_BOUNDARY.md). Room views, refusals and speech are semantic so far. Every other
 * command still sends a finished string, and `Session.send` still accepts `unknown`.
 */
export interface RoomOutput {
  readonly kind: "room"
  readonly name: string
  readonly description: string
  readonly occupants: readonly EntityId[]
}

/** Why a command could not be carried out. A closed set, so presentation can word each one. */
export type RefusalReason =
  | "not-controlling"
  | "nowhere"
  | "no-exit"
  | "save-unavailable"
  | "nothing-to-save"

/** An action that could not be performed. `target-absent` names who was asked for, as typed. */
export type RefusalOutput =
  | { readonly kind: "refusal"; readonly reason: RefusalReason }
  | { readonly kind: "refusal"; readonly reason: "target-absent"; readonly target: string }

export function refusal(reason: RefusalReason): RefusalOutput
export function refusal(reason: "target-absent", target: string): RefusalOutput
export function refusal(reason: RefusalReason | "target-absent", target?: string): RefusalOutput {
  return reason === "target-absent"
    ? { kind: "refusal", reason, target: target ?? "" }
    : { kind: "refusal", reason }
}

/**
 * Something a character said. One event, sent to each recipient with `perspective` saying which
 * side of it they are on, because that is all "You say" vs "X says" is. `addressee` is only set
 * for `tell` sent to the speaker, who needs to see who it went to; it is the name as typed.
 */
export interface SpeechOutput {
  readonly kind: "speech"
  readonly channel: "say" | "tell"
  readonly perspective: "speaker" | "listener"
  readonly speaker: string
  readonly text: string
  readonly addressee?: string
}

/** How a room view reads as text: the presentation half of what `describeRoom` used to do. */
export function renderRoom(room: RoomOutput): string {
  const text = `${room.name}\n${room.description}`
  return room.occupants.length === 0 ? text : `${text}\nAlso here: ${room.occupants.join(", ")}.`
}

/** How a refusal reads as text: the wording the handlers used to hard-code. */
export function renderRefusal(output: RefusalOutput): string {
  switch (output.reason) {
    case "not-controlling":
      return "you are not controlling a character"
    case "nowhere":
      return "you are nowhere"
    case "no-exit":
      return "you can't go that way"
    case "target-absent":
      return `${output.target} is not here`
    case "save-unavailable":
      return "saving is not available"
    case "nothing-to-save":
      return "you have no status to save"
  }
}

/** How speech reads as text, from the recipient's side of it. */
export function renderSpeech(output: SpeechOutput): string {
  if (output.perspective === "speaker") {
    return output.channel === "say"
      ? `You say, "${output.text}"`
      : `You tell ${output.addressee}, "${output.text}"`
  }
  return output.channel === "say"
    ? `${output.speaker} says, "${output.text}"`
    : `${output.speaker} tells you, "${output.text}"`
}
