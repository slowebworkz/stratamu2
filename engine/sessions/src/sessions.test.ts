import { principalId, sessionId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import type { Session } from "./session.ts"
import { Sessions } from "./sessions.ts"

/** No test here reads what was sent -- only whether the right `Session` object was resolved --
 * so `send` is a no-op, unlike the fuller fakes the runtime probes use. */
function testSession(id: string, principal?: string): Session {
  return {
    id: sessionId(id),
    principalId: principal === undefined ? undefined : principalId(principal),
    send() {},
  }
}

describe("Sessions", () => {
  it("starts with no active sessions", () => {
    expect(new Sessions().size).toBe(0)
  })

  it("opens a session and gets it back by id", () => {
    const sessions = new Sessions()
    const alice = testSession("session-1", "alice")

    sessions.open(alice)

    expect(sessions.get(sessionId("session-1"))).toBe(alice)
    expect(sessions.has(sessionId("session-1"))).toBe(true)
    expect(sessions.size).toBe(1)
  })

  it("returns undefined and false for a session id that was never opened", () => {
    const sessions = new Sessions()

    expect(sessions.get(sessionId("nowhere"))).toBeUndefined()
    expect(sessions.has(sessionId("nowhere"))).toBe(false)
  })

  it("refuses to open a session whose id is already active", () => {
    const sessions = new Sessions()
    sessions.open(testSession("session-1", "alice"))

    expect(() => sessions.open(testSession("session-1", "bob"))).toThrow(
      'Session "session-1" is already active',
    )
  })

  it("disconnects a session, and reports whether it was active", () => {
    const sessions = new Sessions()
    sessions.open(testSession("session-1", "alice"))

    expect(sessions.disconnect(sessionId("session-1"))).toBe(true)
    expect(sessions.disconnect(sessionId("session-1"))).toBe(false)
    expect(sessions.size).toBe(0)
  })

  it("treats disconnecting a session that was never opened as a safe no-op", () => {
    const sessions = new Sessions()

    expect(sessions.disconnect(sessionId("nowhere"))).toBe(false)
  })

  it("no longer resolves a disconnected session's id to anything", () => {
    const sessions = new Sessions()
    sessions.open(testSession("session-1", "alice"))

    sessions.disconnect(sessionId("session-1"))

    expect(sessions.get(sessionId("session-1"))).toBeUndefined()
    expect(sessions.has(sessionId("session-1"))).toBe(false)
  })

  it("lets the same id be reopened once it has been disconnected", () => {
    const sessions = new Sessions()
    sessions.open(testSession("session-1", "alice"))
    sessions.disconnect(sessionId("session-1"))

    const reopened = testSession("session-1", "alice")
    expect(() => sessions.open(reopened)).not.toThrow()
    expect(sessions.get(sessionId("session-1"))).toBe(reopened)
  })

  it("finds the active session for a principal", () => {
    const sessions = new Sessions()
    const alice = testSession("session-1", "alice")
    sessions.open(alice)
    sessions.open(testSession("session-2", "bob"))

    expect(sessions.activeFor(principalId("alice"))).toBe(alice)
  })

  it("has no active session for a principal that never connected", () => {
    const sessions = new Sessions()

    expect(sessions.activeFor(principalId("nobody"))).toBeUndefined()
  })

  it("stops finding a principal's session once it disconnects", () => {
    const sessions = new Sessions()
    sessions.open(testSession("session-1", "alice"))

    sessions.disconnect(sessionId("session-1"))

    expect(sessions.activeFor(principalId("alice"))).toBeUndefined()
  })

  it("finds a principal's new session after a reconnect, under its new SessionId", () => {
    const sessions = new Sessions()
    const firstConnection = testSession("session-1", "alice")
    sessions.open(firstConnection)
    sessions.disconnect(sessionId("session-1"))

    const reconnected = testSession("session-2", "alice")
    sessions.open(reconnected)

    expect(sessions.activeFor(principalId("alice"))).toBe(reconnected)
    expect(sessions.has(sessionId("session-1"))).toBe(false)
  })

  it("finds no session for a principal that has no association at all", () => {
    const sessions = new Sessions()
    sessions.open(testSession("session-1"))

    expect(sessions.activeFor(principalId("alice"))).toBeUndefined()
  })
})
