import { describe, expect, it } from "vitest"

import { TelnetCodec, type TelnetEvent } from "../src/telnet-codec.ts"

const IAC = 255
const DO = 253
const WILL = 251
const SB = 250
const SE = 240
const NOP = 241
const GA = 249

function text(...bytes: number[][]): TelnetEvent {
  return { kind: "data", bytes: Uint8Array.from(bytes.flat()) }
}

function ascii(s: string): number[] {
  return [...s].map(c => c.charCodeAt(0))
}

describe("TelnetCodec", () => {
  it("passes plain text through untouched", () => {
    const codec = new TelnetCodec()
    expect(codec.push(Uint8Array.from(ascii("look\r\n")))).toEqual([text(ascii("look\r\n"))])
  })

  it("parses IAC DO <option> split across chunks, byte by byte", () => {
    const codec = new TelnetCodec()
    expect(codec.push(Uint8Array.from([IAC]))).toEqual([])
    expect(codec.push(Uint8Array.from([DO]))).toEqual([])
    expect(codec.push(Uint8Array.from([1]))).toEqual([
      { kind: "command", command: { kind: "do", option: 1 } },
    ])
  })

  it("parses IAC WILL <option> split across chunks", () => {
    const codec = new TelnetCodec()
    expect(codec.push(Uint8Array.from([IAC, WILL]))).toEqual([])
    expect(codec.push(Uint8Array.from([24]))).toEqual([
      { kind: "command", command: { kind: "will", option: 24 } },
    ])
  })

  it("parses a subnegotiation split across chunks, including a split terminator", () => {
    const codec = new TelnetCodec()
    // IAC SB <TTYPE=24> 1 IAC SE, asking the client to send its terminal type.
    expect(codec.push(Uint8Array.from([IAC, SB, 24, 1]))).toEqual([])
    expect(codec.push(Uint8Array.from([IAC]))).toEqual([])
    expect(codec.push(Uint8Array.from([SE]))).toEqual([
      {
        kind: "command",
        command: { kind: "subnegotiation", option: 24, data: Uint8Array.from([1]) },
      },
    ])
  })

  it("unescapes IAC IAC to one literal 0xff inside application data", () => {
    const codec = new TelnetCodec()
    expect(codec.push(Uint8Array.from([...ascii("a"), IAC, IAC, ...ascii("b")]))).toEqual([
      text(ascii("a"), [IAC], ascii("b")),
    ])
  })

  it("unescapes IAC IAC inside a subnegotiation's data", () => {
    const codec = new TelnetCodec()
    const events = codec.push(Uint8Array.from([IAC, SB, 0, IAC, IAC, 5, IAC, SE]))
    expect(events).toEqual([
      {
        kind: "command",
        command: { kind: "subnegotiation", option: 0, data: Uint8Array.from([IAC, 5]) },
      },
    ])
  })

  it("reports negotiation interleaved with application text, each in order", () => {
    const codec = new TelnetCodec()
    const events = codec.push(
      Uint8Array.from([...ascii("go"), IAC, DO, 1, ...ascii("od"), IAC, NOP, ...ascii("bye")]),
    )
    expect(events).toEqual([
      text(ascii("go")),
      { kind: "command", command: { kind: "do", option: 1 } },
      text(ascii("od")),
      { kind: "command", command: { kind: "signal", code: NOP } },
      text(ascii("bye")),
    ])
  })

  it("emits a bare signal command such as Go Ahead", () => {
    const codec = new TelnetCodec()
    expect(codec.push(Uint8Array.from([IAC, GA]))).toEqual([
      { kind: "command", command: { kind: "signal", code: GA } },
    ])
  })

  it("recovers from a malformed subnegotiation instead of hanging", () => {
    const codec = new TelnetCodec()
    // IAC SB 0 <data> IAC <not SE, not IAC> — malformed; the codec must not wait forever for SE,
    // and the stray byte after IAC must still be parsed as the start of a new command.
    const events = codec.push(Uint8Array.from([IAC, SB, 0, 9, IAC, DO, 1]))
    expect(events).toEqual([{ kind: "command", command: { kind: "do", option: 1 } }])
  })

  it("returns to a healthy state after recovering from a malformed subnegotiation", () => {
    const codec = new TelnetCodec()
    // Same malformed sequence as above, immediately followed by ordinary text, to prove
    // recovery didn't just parse the one recovered command correctly but leave the codec in a
    // state where the next bytes go wrong.
    const events = codec.push(Uint8Array.from([IAC, SB, 0, 9, IAC, DO, 1, ...ascii("look")]))
    expect(events).toEqual([
      { kind: "command", command: { kind: "do", option: 1 } },
      text(ascii("look")),
    ])
  })

  it("reports an unrecognized command byte as unknown, not as a signal", () => {
    const codec = new TelnetCodec()
    expect(codec.push(Uint8Array.from([IAC, 0]))).toEqual([
      { kind: "command", command: { kind: "unknown", code: 0 } },
    ])
  })

  it("reports a bare IAC SE (no subnegotiation open) as a signal", () => {
    const codec = new TelnetCodec()
    expect(codec.push(Uint8Array.from([IAC, SE]))).toEqual([
      { kind: "command", command: { kind: "signal", code: SE } },
    ])
  })

  it("keeps state across an arbitrary number of one-byte chunks", () => {
    const codec = new TelnetCodec()
    const bytes = [IAC, WILL, 3]
    const events = bytes.flatMap(byte => codec.push(Uint8Array.from([byte])))
    expect(events).toEqual([{ kind: "command", command: { kind: "will", option: 3 } }])
  })
})
