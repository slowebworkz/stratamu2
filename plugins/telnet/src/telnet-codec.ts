import { Base } from "@stratamu/base"

// Telnet command bytes (RFC 854 and the option-negotiation RFCs). IAC introduces every command;
// everything else on the wire is application data. SE and NOP..GA (240, 241-249: Data Stream End,
// NOP, Data Mark, Break, Interrupt Process, Abort Output, Are You There, Erase Character, Erase
// Line, Go Ahead) are the single-byte commands with no option; StrataMU2 has no use for any of
// them individually, so `isSingleByteCommand` covers them by range rather than naming each one.
// `SE` normally only appears closing a subnegotiation (`sb-data-iac` below matches it before it
// ever reaches this check) -- a bare `IAC SE` is still a real Telnet command, just one with no
// subnegotiation to close, so it is reported the same as any other signal.
const SE = 240
const NOP = 241
const GA = 249
const SB = 250
const WILL = 251
const WONT = 252
const DO = 253
const DONT = 254
const IAC = 255

function isSingleByteCommand(byte: number): boolean {
  return byte === SE || (byte >= NOP && byte <= GA)
}

/** A single-byte command with no option: SE (outside a subnegotiation), NOP, Data Mark, Break,
 * Interrupt Process, Abort Output, Are You There, Erase Character, Erase Line, Go Ahead.
 * StrataMU2 has no use for these yet; the codec still parses them so they never leak into
 * application data as literal bytes. */
export interface TelnetSignal {
  readonly kind: "signal"
  readonly code: number
}

/** A request to enable or disable an option, in either direction. Carries no policy: the codec
 * reports what the other side said, and does not decide how (or whether) to answer it. */
export interface TelnetNegotiation {
  readonly kind: "do" | "dont" | "will" | "wont"
  readonly option: number
}

/** An `IAC SB <option> ... IAC SE` block, with the escaping (`IAC IAC` -> one `0xff`) already
 * undone. */
export interface TelnetSubnegotiation {
  readonly kind: "subnegotiation"
  readonly option: number
  readonly data: Uint8Array
}

/** A byte that followed `IAC` but isn't `SE`, a known signal, a negotiation verb, or `SB`: not a
 * Telnet command this codec recognizes. Reported rather than dropped silently or thrown, so a
 * caller can decide what malformed input deserves; kept distinct from `TelnetSignal` so a real
 * signal such as NOP is never confused with one. */
export interface TelnetUnknownCommand {
  readonly kind: "unknown"
  readonly code: number
}

export type TelnetCommand =
  | TelnetSignal
  | TelnetNegotiation
  | TelnetSubnegotiation
  | TelnetUnknownCommand

export type TelnetEvent =
  | { readonly kind: "data"; readonly bytes: Uint8Array }
  | { readonly kind: "command"; readonly command: TelnetCommand }

type ParserState = "data" | "iac" | "negotiation" | "sb-option" | "sb-data" | "sb-data-iac"

function negotiationVerb(byte: number): TelnetNegotiation["kind"] | undefined {
  switch (byte) {
    case DO:
      return "do"
    case DONT:
      return "dont"
    case WILL:
      return "will"
    case WONT:
      return "wont"
    default:
      return undefined
  }
}

/**
 * Parses the Telnet wire protocol out of a raw byte stream: application bytes and protocol
 * commands come out as separate events, in the order they appeared. State survives across
 * `push` calls, so a command (or an escaped `IAC`) split across TCP chunks parses the same as one
 * that arrives whole.
 *
 * This is parsing only, not policy: a `TelnetNegotiation` is reported, never answered. Nothing
 * here decides which options to support -- that is the negotiation layer this codec exists to
 * make possible, not implement.
 */
export class TelnetCodec extends Base {
  #state: ParserState = "data"
  #data: number[] = []
  /** The verb an `IAC WILL`/`WONT`/`DO`/`DONT` saw, held while waiting for its option byte. Not
   * the negotiation itself -- there is no negotiation until both bytes have arrived. */
  #pendingNegotiation: TelnetNegotiation["kind"] | undefined
  #sbOption = 0
  #sbData: number[] = []

  push(chunk: Uint8Array): TelnetEvent[] {
    const events: TelnetEvent[] = []
    for (const byte of chunk) {
      this.#feed(byte, events)
    }
    this.#flushData(events)
    return events
  }

  #feed(byte: number, events: TelnetEvent[]): void {
    switch (this.#state) {
      case "data":
        this.#feedData(byte)
        return
      case "iac":
        this.#feedIac(byte, events)
        return
      case "negotiation":
        this.#feedNegotiation(byte, events)
        return
      case "sb-option":
        this.#feedSubnegotiationOption(byte)
        return
      case "sb-data":
        this.#feedSubnegotiationData(byte)
        return
      case "sb-data-iac":
        this.#feedSubnegotiationIac(byte, events)
        return
    }
  }

  /** In application data, only `IAC` changes what a byte means. */
  #feedData(byte: number): void {
    if (byte === IAC) {
      this.#state = "iac"
      return
    }
    this.#data.push(byte)
  }

  /** The byte after `IAC`: an escape, or the start of one of the four command shapes. */
  #feedIac(byte: number, events: TelnetEvent[]): void {
    if (byte === IAC) {
      this.#data.push(IAC)
      this.#state = "data"
      return
    }
    // Whatever preceded this `IAC` is done: a real command follows, so it comes before that
    // command's event, never merged into data that arrives after it.
    this.#flushData(events)
    const verb = negotiationVerb(byte)
    if (verb !== undefined) {
      this.#pendingNegotiation = verb
      this.#state = "negotiation"
      return
    }
    if (byte === SB) {
      this.#resetSubnegotiation()
      this.#state = "sb-option"
      return
    }
    if (isSingleByteCommand(byte)) {
      this.#emitSignal(byte, events)
      this.#state = "data"
      return
    }
    // Not a command this codec recognizes. Reported as `unknown` rather than folded into
    // `signal`, so a caller is never left unable to tell a real NOP from malformed input.
    this.log.debug({ code: byte }, "Unrecognized Telnet command byte")
    this.#emitUnknown(byte, events)
    this.#state = "data"
  }

  /** The option byte completing `IAC DO/DONT/WILL/WONT <option>`. */
  #feedNegotiation(byte: number, events: TelnetEvent[]): void {
    const kind = this.#pendingNegotiation
    this.#pendingNegotiation = undefined
    this.#state = "data"
    if (kind !== undefined) {
      events.push({ kind: "command", command: { kind, option: byte } })
    }
  }

  /** The option byte of `IAC SB <option> ...`. */
  #feedSubnegotiationOption(byte: number): void {
    this.#sbOption = byte
    this.#state = "sb-data"
  }

  #feedSubnegotiationData(byte: number): void {
    if (byte === IAC) {
      this.#state = "sb-data-iac"
      return
    }
    this.#sbData.push(byte)
  }

  /** `IAC` inside a subnegotiation is only ever followed by another `IAC` (an escaped data byte)
   * or `SE` (the terminator); anything else is malformed input. Recovering by discarding the
   * open subnegotiation and re-feeding this byte as the byte after a fresh `IAC` is the same
   * choice `#feedIac` makes for an unrecognized command byte: never let it become application
   * data, and never hang waiting for an `SE` that a bug won't send. */
  #feedSubnegotiationIac(byte: number, events: TelnetEvent[]): void {
    if (byte === IAC) {
      this.#sbData.push(IAC)
      this.#state = "sb-data"
      return
    }
    if (byte === SE) {
      this.#emitSubnegotiation(events)
      return
    }
    this.log.debug(
      { option: this.#sbOption, code: byte },
      "Malformed subnegotiation: IAC not followed by IAC or SE, abandoning it",
    )
    this.#resetSubnegotiation()
    this.#state = "iac"
    this.#feedIac(byte, events)
  }

  #flushData(events: TelnetEvent[]): void {
    if (this.#data.length > 0) {
      events.push({ kind: "data", bytes: Uint8Array.from(this.#data) })
      this.#data = []
    }
  }

  #emitSignal(code: number, events: TelnetEvent[]): void {
    events.push({ kind: "command", command: { kind: "signal", code } })
  }

  #emitUnknown(code: number, events: TelnetEvent[]): void {
    events.push({ kind: "command", command: { kind: "unknown", code } })
  }

  #emitSubnegotiation(events: TelnetEvent[]): void {
    events.push({
      kind: "command",
      command: {
        kind: "subnegotiation",
        option: this.#sbOption,
        data: Uint8Array.from(this.#sbData),
      },
    })
    this.#resetSubnegotiation()
    this.#state = "data"
  }

  #resetSubnegotiation(): void {
    this.#sbOption = 0
    this.#sbData = []
  }
}
