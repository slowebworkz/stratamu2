import { type AberMUDAdapter, type AberOutput, renderOutput } from "@stratamu/adapter-abermud"
import type { Engine } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import { type EntityId, sessionId } from "@stratamu/primitives"

import type { Connection } from "../../src/index.ts"

/**
 * The Name/Password login flow, and the hand-off from it into ordinary game input. This is
 * composition, not a `TelnetCodec`/`TelnetNegotiator` concern and not a generic `Connection`
 * concern either: it exists to prove `Connection.setEcho` actually gets used around a real
 * password prompt, the seam the whole Telnet plugin exists to reach. It lives in this package's
 * test support, not `src`, for the same reason `engine-flow.test.ts` does -- see that file and
 * the README: no app exists yet to own this composition, so a real-socket test proves it instead.
 *
 * Deliberately out of scope, same as `engine-flow.test.ts`'s login shortcut:
 * - New-character creation. `AberMUDAdapter.login` needs a `sex` only for a brand-new character;
 *   this always passes `0` rather than prompting for it, so login only actually works for a name
 *   with an existing persona. Interactive character creation is a separate, larger flow.
 * - A retry limit. A wrong password reprompts for a name indefinitely; a real server would want
 *   a limit and a disconnect.
 * - Any wording beyond "Name:"/"Password:"/"Login incorrect."; a real front end's prompts are a
 *   presentation concern, same as `AberOutput`'s `renderOutput`.
 */
export interface AberMUDLoginOptions {
  readonly connection: Connection
  readonly engine: Engine<{ readonly session: Session; readonly raw: string }>
  readonly adapter: AberMUDAdapter
  /** Called once login succeeds, so a caller can do whatever placing a fresh character needs
   * (a starting room, for instance) before ordinary input starts flowing to it. */
  readonly onLoggedIn?: (character: EntityId, session: Session) => void
}

type Stage = "name" | "password" | "playing"

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
      // `receive` only submits; running the Runtime is the transport loop's job, same choice
      // `engine-flow.test.ts` makes.
      void engine.runtime.drain()
      return
    }

    if (stage === "name") {
      name = raw.trim()
      stage = "password"
      connection.setEcho(false)
      connection.write("Password: ")
      return
    }

    // stage === "password"
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
        // The renderer lives on the session, so the engine and adapter never see the wire; same
        // choice `engine-flow.test.ts` makes.
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
