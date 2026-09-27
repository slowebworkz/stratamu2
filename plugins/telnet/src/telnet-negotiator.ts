import { Base } from "@stratamu/base"

import type { TelnetCommand } from "./telnet-codec.ts"

const IAC = 255
const WILL = 251
const WONT = 252
const DO = 253
const DONT = 254

/** RFC 857's echo option. The only option this negotiator has policy for. */
const ECHO = 1

export type TelnetWriter = (bytes: Uint8Array) => void

/**
 * Telnet option-negotiation *policy*, kept deliberately separate from `TelnetCodec`'s wire
 * grammar: the codec reports what a `TelnetNegotiation` said, this class decides how (or
 * whether) to answer it.
 *
 * The one option implemented is ECHO, because it's the option a password prompt needs: sending
 * `IAC WILL ECHO` tells a well-behaved client "I will echo what you type", which is untrue --
 * the point is that the client trusts it and suppresses its own local echo, so the password
 * never appears on screen. `IAC WONT ECHO` reverses that. See RFC 857.
 *
 * Every other option gets RFC 854's baseline courtesy: refused, so a real Telnet client's
 * negotiation for NAWS, TTYPE or anything else gets an answer instead of hanging, without this
 * class pretending to support it. Implementing one of those is adding a case here, not
 * redesigning the class.
 */
export class TelnetNegotiator extends Base {
  #write: TelnetWriter
  /** Whether the server last told the client it *will* echo (`false`) or *won't* (`true`) --
   * named for what this side is negotiating, not for the client's resulting local-echo state,
   * which this doesn't track. `undefined` before either has been sent. Only what was last told
   * to the client, not what the client agreed to: see the note on `setEcho` below. */
  #serverEcho: boolean | undefined

  constructor(write: TelnetWriter) {
    super()
    this.#write = write
  }

  /** Suppresses (`active: false`) or restores (`active: true`) the client's local echo, for a
   * password prompt, by claiming (or withdrawing) server-side echo. A no-op if the client was
   * already told this.
   *
   * This only tracks what was last *sent*, not what the client *agreed to*: a client that
   * answers `IAC WILL ECHO` with `DONT` (refusing it) is not modeled, so a later `setEcho(false)`
   * stays a no-op rather than retrying. Distinguishing "told" from "agreed" is RFC 1143 territory
   * -- worth adding once a real client's refusal makes it matter, not speculatively. */
  setEcho(active: boolean): void {
    if (this.#serverEcho === active) {
      return
    }
    this.#serverEcho = active
    this.#write(Uint8Array.from([IAC, active ? WONT : WILL, ECHO]))
  }

  /** Feeds one command the codec parsed off the wire. Only `DO`/`WILL` need an answer: `DONT`
   * and `WONT` are the client declining or withdrawing something, which needs no reply, and a
   * signal, subnegotiation, or unrecognized command byte isn't option negotiation at all. */
  handle(command: TelnetCommand): void {
    if (command.kind === "do") {
      this.#answerDo(command.option)
    } else if (command.kind === "will") {
      this.#answerWill(command.option)
    }
  }

  #answerDo(option: number): void {
    if (option === ECHO && this.#serverEcho === false) {
      // The client is acknowledging the `WILL ECHO` `setEcho(false)` already sent. Answering
      // `WONT` here, as the default case below would, immediately contradicts what was just
      // offered.
      return
    }
    this.#refuse(DO, option)
  }

  #answerWill(option: number): void {
    this.#refuse(WILL, option)
  }

  #refuse(verb: typeof DO | typeof WILL, option: number): void {
    this.log.debug({ verb, option }, "Refusing an option this negotiator has no policy for")
    this.#write(Uint8Array.from([IAC, verb === DO ? WONT : DONT, option]))
  }
}
