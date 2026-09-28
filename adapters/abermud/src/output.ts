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

/** Why a command could not be carried out. A closed set, so presentation can word each one.
 * `get-what`/`drop-what`/`not-here`/`not-takeable`/`not-carrying` and the WIELD/WEAR/REMOVE
 * reasons below are AberMUD II's own verbatim messages (see `getobj()`/`dropitem()` in
 * `mud/objsys.c`, `weapcom()` in `mud/blood.c`, and `wearcom()`/`removecom()`/`ohereandget()` in
 * `mud/new1.c` -- the package README's "Reference" links directly to each), not invented
 * wording, the same discipline SAVE's exact message already followed. Several read almost like
 * duplicates of an existing reason (`"You are not carrying this"` next to `"You are not carrying
 * that."`, say) but are kept as distinct, separately-verified strings rather than merged into
 * one guess at "the" wording -- the source itself never settled on one, so this doesn't invent a
 * consistency the original never had. */
export type RefusalReason =
  | "not-controlling"
  | "nowhere"
  | "no-exit"
  | "save-unavailable"
  | "nothing-to-save"
  | "get-what"
  | "drop-what"
  | "not-here"
  | "not-takeable"
  | "not-carrying"
  | "wield-what"
  | "no-such-weapon"
  | "not-a-weapon"
  | "tell-me-more"
  | "not-carrying-this"
  | "already-wearing"
  | "not-wearable"
  | "not-wearing"
  | "kill-who"
  | "cant-kill-self"
  | "cant-find-them"
  | "not-here-to-fight"

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

/**
 * An object was picked up. One event, sent to each recipient with `perspective` saying which
 * side of it they are on, the same reasoning `SpeechOutput` already uses -- but here the two
 * sides say genuinely different things, not just "you"/"they": AberMUD II's `getobj()` replies to
 * the actor with a fixed, contentless "Ok...", and only the room broadcast names the item. That
 * asymmetry is preserved exactly, not smoothed over into a more informative actor message.
 */
export interface TakenOutput {
  readonly kind: "taken"
  readonly perspective: "actor" | "observer"
  readonly actor: string
  readonly item: string
}

/** An object was set down. Same shape and the same actor/observer asymmetry as `TakenOutput`,
 * matching `dropitem()`. */
export interface DroppedOutput {
  readonly kind: "dropped"
  readonly perspective: "actor" | "observer"
  readonly actor: string
  readonly item: string
}

/** What a character is carrying. Matches `inventory()`/`aobjsat()`: every item's name, in no
 * particular order (the recovered source's own ordering is object-table order, an implementation
 * detail this adapter has no reason to reproduce). */
export interface InventoryOutput {
  readonly kind: "inventory"
  readonly items: readonly string[]
}

/**
 * A character left the game. Same actor/observer split as `TakenOutput`, and the same asymmetry:
 * the actor's own message is a bare confirmation (`doaction()`'s `bprintf("Ok")`, no ellipsis --
 * distinct from GET's "Ok..."), only the room broadcast names who left. What actually ends the
 * connection is not this type's concern: it is composition's job to notice a `"quit"`, `"actor"`
 * output on its way out and close the transport after it, the same reason `Session`/`Connection`
 * never appear in this package at all -- see `login/abermud-login.ts`.
 */
export interface QuitOutput {
  readonly kind: "quit"
  readonly perspective: "actor" | "observer"
  readonly name: string
}

/** A weapon was wielded. Matches `weapcom()`: no room broadcast -- unlike GET/DROP, wielding is
 * private, observable only once combat itself reads it. */
export interface WieldedOutput {
  readonly kind: "wielded"
}

/** An object was worn. Matches `wearcom()`: also private, no room broadcast. */
export interface WornOutput {
  readonly kind: "worn"
}

/**
 * One resolved attack, from one side of it. Verified against `hitplayer()`/`bloodrcv()` in
 * `mud/blood.c`. Genuinely a two-party exchange, not the actor/observer-everyone-else pattern
 * `TakenOutput`/`DroppedOutput`/`QuitOutput` use: the source's own `hitplayer()` never broadcasts
 * to the room at all, only to the attacker (directly, `bprintf`) and the victim (`sendsys`) -- a
 * real absence, not an oversight here, so no third output for other room occupants exists.
 * `weapon` is only set when a weapon (not bare hands) was used, matching the source's own
 * `if(wpn!=-1)` gate on whether to name one at all.
 */
export interface CombatOutput {
  readonly kind: "combat"
  readonly perspective: "attacker" | "victim"
  readonly outcome: "hit" | "miss"
  readonly attacker: string
  readonly victim: string
  readonly weapon?: string
}

/**
 * A hit was lethal. Sent alongside `CombatOutput` (after it, matching the source's own message
 * order), once per side. The victim's own three lines -- `"X has just died."`, `"[ X has been
 * slain by Y ]"`, and `crapup()`'s disconnect message -- are `bloodrcv()`'s own sequence of two
 * `sendsys` calls immediately followed by the forced disconnect; rendered together here since
 * nothing can happen between them. Composition (`login/abermud-login.ts`) closes the connection
 * on a `"killed"`, `"victim"` output the same way it already does for `"quit"`, `"actor"`.
 */
export interface KilledOutput {
  readonly kind: "killed"
  readonly perspective: "attacker" | "victim"
  readonly attacker: string
  readonly victim: string
}

/** Everything an AberMUD command can send a session. */
export type AberOutput =
  | RoomOutput
  | RefusalOutput
  | SpeechOutput
  | ExitsOutput
  | PlayersOutput
  | SavedOutput
  | TakenOutput
  | DroppedOutput
  | InventoryOutput
  | QuitOutput
  | WieldedOutput
  | WornOutput
  | CombatOutput
  | KilledOutput

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
    case "get-what":
      return "Get what ?"
    case "drop-what":
      return "Drop what ?"
    case "not-here":
      return "That is not here."
    case "not-takeable":
      return "You can't take that!"
    case "not-carrying":
      return "You are not carrying that."
    case "wield-what":
      return "Which weapon do you wish to select though"
    case "no-such-weapon":
      return "Whats one of those ?"
    case "not-a-weapon":
      return "Thats not a weapon"
    case "tell-me-more":
      return "Tell me more ?"
    case "not-carrying-this":
      return "You are not carrying this"
    case "already-wearing":
      return "You are wearing this"
    case "not-wearable":
      return "Is this a new fashion ?"
    case "not-wearing":
      return "You are not wearing this"
    case "kill-who":
      return "Kill who"
    case "cant-kill-self":
      return "Come on, it will look better tomorrow..."
    case "cant-find-them":
      return "You can't do that"
    case "not-here-to-fight":
      return "They aren't here"
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
  return output.names.length === 0 ? "no one else is online" : `online: ${output.names.join(", ")}`
}

export function renderSaved(output: SavedOutput): string {
  return `Saving ${output.name}`
}

/** How a pickup reads as text, from the recipient's side of it. Verbatim AberMUD II wording. */
export function renderTaken(output: TakenOutput): string {
  return output.perspective === "actor" ? "Ok..." : `${output.actor} takes the ${output.item}`
}

/** How a drop reads as text. `dropitem()`'s room broadcast has a blank line after it in the
 * recovered source (`"...drops the %s.\n\n"`); that trailing blank line is kept. */
export function renderDropped(output: DroppedOutput): string {
  return output.perspective === "actor" ? "OK.." : `${output.actor} drops the ${output.item}.\n`
}

export function renderInventory(output: InventoryOutput): string {
  return `You are carrying\n${output.items.length === 0 ? "Nothing" : output.items.join(" ")}`
}

/** How leaving reads as text. Verbatim AberMUD II wording (`"Ok"`, `"<name> has left the game"`). */
export function renderQuit(output: QuitOutput): string {
  return output.perspective === "actor" ? "Ok" : `${output.name} has left the game`
}

/** Verbatim `weapcom()` wording. Takes no `WieldedOutput` argument -- unlike every other `render*`
 * here, this one has no field to read; `AberOutput`'s `kind` alone is what routes to it. */
export function renderWielded(): string {
  return "OK..."
}

/** Verbatim `wearcom()` wording. Note the missing ellipsis: `renderTaken`'s "Ok...",
 * `renderDropped`'s "OK..", `renderWielded`'s "OK..." and this one's bare "OK" are four genuinely
 * different confirmation strings in the source, not a typo introduced here. Also takes no
 * argument, for the same reason `renderWielded` doesn't. */
export function renderWorn(): string {
  return "OK"
}

/** How one side of an attack reads as text. Verbatim `hitplayer()`/`bloodrcv()` wording, weapon
 * phrasing only appended when one was used. */
export function renderCombat(output: CombatOutput): string {
  const weaponPhrase = output.weapon === undefined ? "" : ` with the ${output.weapon}`
  if (output.perspective === "attacker") {
    return output.outcome === "hit"
      ? `You hit ${output.victim}${weaponPhrase}`
      : `You missed ${output.victim}`
  }
  return output.outcome === "hit"
    ? `You are wounded by ${output.attacker}${weaponPhrase}`
    : `${output.attacker} attacks you${weaponPhrase}`
}

/** How a lethal hit reads as text, from each side. Verbatim `hitplayer()`/`bloodrcv()` wording;
 * the victim's three lines (`bloodrcv()`'s two `sendsys` calls and `crapup()`'s own disconnect
 * message) are rendered together since the source sends them as one uninterrupted sequence. */
export function renderKilled(output: KilledOutput): string {
  if (output.perspective === "attacker") {
    return "Your last blow did the trick"
  }
  return [
    `${output.victim} has just died.`,
    `[ ${output.victim} has been slain by ${output.attacker} ]`,
    "Oh dear... you seem to be slightly dead",
  ].join("\n")
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
    case "taken":
      return renderTaken(output)
    case "dropped":
      return renderDropped(output)
    case "inventory":
      return renderInventory(output)
    case "quit":
      return renderQuit(output)
    case "wielded":
      return renderWielded()
    case "worn":
      return renderWorn()
    case "combat":
      return renderCombat(output)
    case "killed":
      return renderKilled(output)
  }
}
