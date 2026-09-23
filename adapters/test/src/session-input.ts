import type { Session } from "@stratamu/engine-sessions"

/**
 * What a real transport loop would have in hand for one line of session-originated input: the
 * session it arrived on, and the raw text itself -- exactly what every earlier probe's own ad hoc
 * `parse(session, ..., raw)` took as separate arguments, bundled here into the one thing
 * `TestAdapter.parse` needs.
 *
 * `session` is not optional. Input always arrives on a session -- there is no such thing as raw
 * text typed by nobody. NPC/script-driven `Work` is a different path entirely: it is constructed
 * directly (`work(look, { session: undefined, actor, ... })`) and never goes through `parse` at
 * all, the same way every earlier probe kept it.
 */
export interface SessionInput {
  readonly session: Session
  readonly raw: string
}
