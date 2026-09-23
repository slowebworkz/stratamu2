import type { Session } from "@stratamu/engine-sessions"
import { principalId, sessionId } from "@stratamu/primitives"

/** A `Session` plus an `output` array exposed purely for assertions -- not part of `Session`
 * itself, the same extra field every earlier probe's own fake added. */
export interface TestSession extends Session {
  readonly output: unknown[]
}

/**
 * The same in-process fake five probes each declared locally: no networking, no real transport --
 * `send` just records what it was given. Reusable now for the same reason `Session` itself was
 * promoted into `@stratamu/engine-sessions`: once enough independent places needed the identical
 * thing, that was the concrete evidence it should stop being re-declared per file. Kept in this
 * adapter, not in `@stratamu/engine-sessions` itself, because a real session fake is a testing
 * concern, not something a production session registry should ship.
 */
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
