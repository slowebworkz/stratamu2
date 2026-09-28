import type { Engine } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import { type EntityId, sessionId } from "@stratamu/primitives"

import type { AberMUDAdapter } from "../adapter.ts"
import type { AberOutput } from "../output.ts"
import { renderOutput } from "../output.ts"
import type { AberMUDLoginConnection } from "./login-connection.ts"

/**
 * The Name/Password login flow, and the hand-off from it into ordinary game input.
 *
 * Deliberately out of scope:
 * - New-character creation. `AberMUDAdapter.login` needs a `sex` only for a brand-new character;
 *   this always passes `0` rather than prompting for it, so login only actually works for a name
 *   with an existing persona. Interactive character creation is a separate, larger flow.
 * - A retry limit. A wrong password reprompts for a name indefinitely; a real server would want
 *   a limit and a disconnect.
 * - Any wording beyond "Name:"/"Password:"/"Login incorrect."; a real front end's prompts are a
 *   presentation concern, same as `AberOutput`'s `renderOutput`.
 */
export interface AberMUDLoginOptions {
  readonly connection: AberMUDLoginConnection
  readonly engine: Engine<{ readonly session: Session; readonly raw: string }>
  readonly adapter: AberMUDAdapter
  /** Called once login succeeds, so a caller can do whatever placing a fresh character needs
   * (a starting room, for instance) before ordinary input starts flowing to it. */
  readonly onLoggedIn?: (character: EntityId, session: Session) => void
}

type Stage = "name" | "password" | "authenticating" | "playing"

/**
 * A step budget for `engine.runtime.pump()` after each line of ordinary game input. Not derived
 * from anything -- `docs/EXECUTION_POLICY.md` (in the main repository) leaves "what bound" an
 * open question, answerable once real use teaches us what a command actually needs, the same way
 * `TelnetNegotiator`'s ECHO taught us what it needed. Generous for what any current AberMUD
 * command does (LOOK/MOVE/SAY resolve in one step, or a handful for SAY's fan-out), while still
 * giving a guaranteed return `drain()` cannot, for a handler that reschedules itself.
 */
const STEP_BUDGET_PER_LINE = 100

/**
 * Starts the login flow on a freshly accepted `connection`: prompts for a name, then a password
 * with the client's local echo suppressed for it, authenticates, and on success opens a
 * `Session` and switches to routing lines through `engine.receive`. On a failed authentication,
 * reprompts for a name rather than closing the connection.
 */
export function runAberMUDLogin(options: AberMUDLoginOptions): void {
  const { connection, engine, adapter } = options
  let stage: Stage = "name"
  let name = ""
  let session: Session | undefined

  connection.write("Name: ")

  connection.onLine(raw => {
    if (stage === "playing") {
      if (session === undefined) {
        // Unreachable: `session` is always set before `stage` becomes "playing". Guarded so a
        // future refactor that breaks that invariant fails loudly instead of dereferencing
        // `undefined`.
        throw new Error("Reached playing stage without an open session")
      }
      engine.receive({ session, raw })
      // `receive` only submits; running the Runtime is the transport loop's job. `pump`, not
      // `drain`: a guaranteed return regardless of what a handler does, not an assumption that
      // nothing here ever reschedules itself. See `STEP_BUDGET_PER_LINE`.
      void engine.runtime.pump(STEP_BUDGET_PER_LINE)
      return
    }

    if (stage === "name") {
      name = raw.trim()
      stage = "password"
      connection.setEcho(false)
      connection.write("Password: ")
      return
    }

    if (stage === "authenticating") {
      // `authenticate` is async; nothing stops another line arriving before it resolves, and a
      // network connection can't be assumed to behave like an interactive client that waits for
      // its own prompt. Dropped rather than queued: there is nothing yet to do with a line sent
      // before the account it would apply to is even decided, and a real client sends one at a
      // time anyway.
      return
    }

    // stage === "password"
    stage = "authenticating"
    const password = raw
    // The client's own local echo was off for that line, so nothing moved the cursor to a new
    // line the way it normally would on Enter; move it now, before anything else is written.
    connection.write("\r\n")
    void authenticate(password)
  })

  function authenticate(password: string): Promise<void> {
    return adapter.authenticate(name, password).then(principal => {
      // Echo stays suppressed for the whole authentication call, not just while the password was
      // being typed: restoring it earlier would be correct for typing but leaves it off for no
      // reason during whatever `authenticate` itself takes to resolve.
      connection.setEcho(true)
      if (principal === undefined) {
        connection.write("Login incorrect.\r\n")
        stage = "name"
        connection.write("Name: ")
        return
      }
      const newSession: Session = {
        id: sessionId(connection.id),
        principalId: principal,
        // The renderer lives on the session, so the engine and adapter never see the wire.
        send: message => connection.write(`${renderOutput(message as AberOutput)}\r\n`),
      }
      session = newSession
      engine.sessions.open(newSession)
      return adapter.login(engine.world, newSession, name, 0).then(character => {
        stage = "playing"
        options.onLoggedIn?.(character, newSession)
        connection.write("ready\r\n")
      })
    })
  }

  connection.onClose(() => {
    if (session !== undefined) {
      engine.sessions.disconnect(session.id)
    }
  })
}
