import type { EntityId } from "@stratamu/primitives"

/**
 * What a character sees of the room they are in: a game fact, not wording. Occupants are entity
 * ids because `WorldState` holds no names yet; who resolves them to something displayable is an
 * open question (docs/OUTPUT_BOUNDARY.md). Every command now sends one of the `AberOutput` variants. `Session.send` still
 * accepts `unknown`: the engine cannot name an adapter's output type.
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

/** The directions out of the current room, in the order the room lists them. */
export interface ExitsOutput {
  readonly kind: "exits"
  readonly directions: readonly string[]
}

/** Who is online. Names are the character names as WHO has always listed them. */
export interface PlayersOutput {
  readonly kind: "players"
  readonly names: readonly string[]
}

/** A character was saved. */
export interface SavedOutput {
  readonly kind: "saved"
  readonly name: string
}

/** Everything an AberMUD command can send a session. */
export type AberOutput =
  | RoomOutput
  | RefusalOutput
  | SpeechOutput
  | ExitsOutput
  | PlayersOutput
  | SavedOutput

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

export function renderExits(output: ExitsOutput): string {
  return output.directions.length === 0
    ? "there are no obvious exits"
    : `obvious exits: ${output.directions.join(", ")}`
}

export function renderPlayers(output: PlayersOutput): string {
  return output.names.length === 0
    ? "no one else is online"
    : `online: ${output.names.join(", ")}`
}

export function renderSaved(output: SavedOutput): string {
  return `Saving ${output.name}`
}

/** Any AberMUD output as plain text. Exhaustive: a new variant fails to compile until worded. */
export function renderOutput(output: AberOutput): string {
  switch (output.kind) {
    case "room":
      return renderRoom(output)
    case "refusal":
      return renderRefusal(output)
    case "speech":
      return renderSpeech(output)
    case "exits":
      return renderExits(output)
    case "players":
      return renderPlayers(output)
    case "saved":
      return renderSaved(output)
  }
}
