import type { Session } from "@stratamu/engine-sessions"
import { principalId, sessionId } from "@stratamu/primitives"

export interface TestSession extends Session {
  readonly output: unknown[]
}

export function testSession(id: string, principal?: string): TestSession {
  const output: unknown[] = []
  return {
    id: sessionId(id),
    principalId: principal === undefined ? undefined : principalId(principal),
    output,
    send(message) {
      output.push(message)
    },
  }
}
