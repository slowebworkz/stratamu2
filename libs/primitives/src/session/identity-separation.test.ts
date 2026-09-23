import { describe, expect, it } from "vitest"

import type { EntityId } from "../entity/entity-id.ts"
import { taskId } from "../task/task-id.ts"
import type { PrincipalId } from "./principal-id.ts"
import { principalId } from "./principal-id.ts"
import type { SessionId } from "./session-id.ts"
import { sessionId } from "./session-id.ts"

/**
 * docs/SESSION_BOUNDARY.md section 2: SessionId, PrincipalId and EntityId are three distinct
 * concepts with different lifetimes, and must not be collapsed into one identifier. Checked here
 * at the type level, the same way `libs/entity`'s and `libs/work`'s own mix-up tests are, plus
 * `TaskId` as a fourth, previously-established identity these must also stay distinct from.
 */
// Checked by `pnpm typecheck`: if one of these lines stops being an error, its directive fails.
describe("SessionId, PrincipalId and EntityId reject mix-ups at compile time", () => {
  it("does not accept a SessionId where a PrincipalId is expected, or the reverse", () => {
    // @ts-expect-error a SessionId is not a PrincipalId
    const wrong: PrincipalId = sessionId("session-1")
    // @ts-expect-error a PrincipalId is not a SessionId
    const wrongWay: SessionId = principalId("alice")

    expect([wrong, wrongWay]).toHaveLength(2)
  })

  it("does not accept a SessionId or PrincipalId where an EntityId is expected", () => {
    // @ts-expect-error a SessionId is not an EntityId
    const wrongSession: EntityId = sessionId("session-1")
    // @ts-expect-error a PrincipalId is not an EntityId
    const wrongPrincipal: EntityId = principalId("alice")

    expect([wrongSession, wrongPrincipal]).toHaveLength(2)
  })

  it("does not accept a TaskId where a SessionId or PrincipalId is expected", () => {
    // @ts-expect-error a TaskId is not a SessionId
    const wrongSession: SessionId = taskId("task-1")
    // @ts-expect-error a TaskId is not a PrincipalId
    const wrongPrincipal: PrincipalId = taskId("task-1")

    expect([wrongSession, wrongPrincipal]).toHaveLength(2)
  })

  it("lets the same principal be associated with more than one session over time", () => {
    const alice = principalId("alice")
    const firstConnection = sessionId("session-1")
    const reconnected = sessionId("session-2")

    // The principal is unchanged; only the session identity is new. Nothing here forces that in
    // code -- reconnect logic is a future concern -- this only checks the values stay distinct.
    expect(firstConnection).not.toBe(reconnected)
    expect(alice).toBe(alice)
  })
})
