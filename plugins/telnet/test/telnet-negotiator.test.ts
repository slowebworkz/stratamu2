import { describe, expect, it } from "vitest"

import { TelnetNegotiator } from "../src/telnet-negotiator.ts"

const IAC = 255
const WILL = 251
const WONT = 252
const DONT = 254
const ECHO = 1

function writer(): { negotiator: TelnetNegotiator; sent: number[][] } {
  const sent: number[][] = []
  const negotiator = new TelnetNegotiator(bytes => sent.push([...bytes]))
  return { negotiator, sent }
}

describe("TelnetNegotiator", () => {
  it("suppresses echo with IAC WILL ECHO", () => {
    const { negotiator, sent } = writer()
    negotiator.setEcho(false)
    expect(sent).toEqual([[IAC, WILL, ECHO]])
  })

  it("restores echo with IAC WONT ECHO", () => {
    const { negotiator, sent } = writer()
    negotiator.setEcho(true)
    expect(sent).toEqual([[IAC, WONT, ECHO]])
  })

  it("does not resend when the state hasn't changed", () => {
    const { negotiator, sent } = writer()
    negotiator.setEcho(false)
    negotiator.setEcho(false)
    expect(sent).toEqual([[IAC, WILL, ECHO]])
  })

  it("sends WONT then WILL again when echo is toggled back on and off", () => {
    const { negotiator, sent } = writer()
    negotiator.setEcho(false)
    negotiator.setEcho(true)
    negotiator.setEcho(false)
    expect(sent).toEqual([
      [IAC, WILL, ECHO],
      [IAC, WONT, ECHO],
      [IAC, WILL, ECHO],
    ])
  })

  it("accepts the client's acknowledgment of WILL ECHO without answering it", () => {
    const { negotiator, sent } = writer()
    negotiator.setEcho(false)
    negotiator.handle({ kind: "do", option: ECHO })
    expect(sent).toEqual([[IAC, WILL, ECHO]])
  })

  it("does not retry after a client rejects WILL ECHO -- a known simplification", () => {
    const { negotiator, sent } = writer()
    negotiator.setEcho(false)
    negotiator.handle({ kind: "dont", option: ECHO }) // client refuses
    negotiator.setEcho(false)
    // This negotiator tracks only what it last *sent*, not what the client *agreed to*, so a
    // rejected WILL ECHO is never retried: the second `setEcho(false)` is still a no-op. Modeling
    // the client's answer (RFC 1143) is future work, once a real client's refusal makes it
    // matter; this test exists to say so, not to assert the limitation is correct.
    expect(sent).toEqual([[IAC, WILL, ECHO]])
  })

  it("refuses a DO for an option it has no policy for", () => {
    const { negotiator, sent } = writer()
    negotiator.handle({ kind: "do", option: 31 }) // NAWS
    expect(sent).toEqual([[IAC, WONT, 31]])
  })

  it("refuses a WILL for an option it has no policy for", () => {
    const { negotiator, sent } = writer()
    negotiator.handle({ kind: "will", option: 24 }) // TTYPE
    expect(sent).toEqual([[IAC, DONT, 24]])
  })

  it("still refuses an unsolicited DO ECHO, since it never offered WILL ECHO", () => {
    const { negotiator, sent } = writer()
    negotiator.handle({ kind: "do", option: ECHO })
    expect(sent).toEqual([[IAC, WONT, ECHO]])
  })

  it("ignores DONT and WONT: there is nothing this negotiator offers to withdraw", () => {
    const { negotiator, sent } = writer()
    negotiator.handle({ kind: "dont", option: ECHO })
    negotiator.handle({ kind: "wont", option: 24 })
    expect(sent).toEqual([])
  })

  it("ignores signals, subnegotiations and unknown commands", () => {
    const { negotiator, sent } = writer()
    negotiator.handle({ kind: "signal", code: 249 })
    negotiator.handle({ kind: "subnegotiation", option: 24, data: Uint8Array.from([1]) })
    negotiator.handle({ kind: "unknown", code: 0 })
    expect(sent).toEqual([])
  })
})
