# @stratamu/plugin-telnet

Network I/O for the engine, as a **plugin**: replaceable infrastructure, not game semantics and not core. The engine and adapters never see a socket; they see a `Connection` (lines in, text out) and a `Session` someone built around it.

**Status:** spike. Private and unpublished.

## What exists

- `createLineServer(onConnection)`: accepts TCP connections and hands each to `onConnection` as a `TelnetConnection`.
- `Connection`: `onLine`, `onClose`, `write`, `close`. The shape any line transport could offer; says nothing about what is on the wire, and nothing Telnet-specific.
- `TelnetConnection extends Connection`: adds `onCommand` and `setEcho`, the two things only Telnet's own protocol makes possible. Split out from `Connection` so a login flow (or anything else) that needs `setEcho` says so in its own types, rather than every `Connection` silently promising a Telnet capability it may not have.
- `TelnetCodec`: parses the Telnet wire protocol (IAC, option negotiation, subnegotiation, escaping) out of a raw byte stream. Reports what the client sent; answers nothing.
- `TelnetNegotiator`: answers what the codec reports. Implements one option, ECHO (`TelnetConnection.setEcho`, for password prompts); refuses everything else per RFC 854, so a real client's negotiation for NAWS, TTYPE or anything else gets a reply instead of hanging.
- `LineBuffer`: application bytes in, complete lines out (`\n` or `\r\n`, split packets).

The wire path is:

```text
TCP chunks -> TelnetCodec -> application bytes -> StringDecoder (UTF-8) -> LineBuffer -> onLine
                           -> Telnet commands -> TelnetNegotiator (answers) --and--> onCommand
```

Telnet parsing happens before UTF-8 decoding, deliberately: `IAC` is a byte value (`0xff`) that can appear inside a multi-byte UTF-8 sequence, so decoding first would risk splitting a command out of the wrong place. `StringDecoder` only ever sees application bytes, and stays responsible for a UTF-8 sequence split across TCP chunks, same as before the codec existed.

**Implemented:** TCP transport, line framing, UTF-8 decoding, Telnet IAC parsing, Telnet command and subnegotiation extraction (`TelnetCodec`), Telnet option-negotiation policy for ECHO with a default refusal for everything else (`TelnetNegotiator`).

**Not yet:** SGA, NAWS, TTYPE, negotiated client capabilities exposed to an adapter, output negotiation.

This package no longer contains any AberMUD- or Engine-specific code -- see "The AberMUD login flow moved out" below.

## The boundary this is meant to keep

This package owns *mechanism* and Telnet *option policy* -- sockets, framing, the wire grammar, and answering a negotiation -- not *game* policy: a login flow, wording, colour, input preprocessing. That stays with a game's adapter, written against `Connection`/`TelnetConnection`.

```text
TCP socket -> TelnetCodec (wire grammar, state machine, escaping) -> TelnetEvent
                                                                          |
                                                                          v
                                                          TelnetNegotiator (option state,
                                                          ECHO implemented; SGA, NAWS, TTYPE not yet)
                                                                          |
                                                                          v
                                                                TelnetConnection -> Engine
```

`TelnetCodec` and `TelnetNegotiator` are both frozen for now: no more abstraction in either, and their current tests are the protocol contract. `TelnetCodec` reports every command shape RFC 854 and the option-negotiation RFCs define, distinguishes a genuinely unrecognized command byte (`unknown`) from a known signal, and recovers from malformed input (an `IAC` inside a subnegotiation followed by neither `IAC` nor `SE`) without hanging or corrupting later input. `TelnetNegotiator` has exactly one option implemented, tracking only what was last *sent*, not what the client *agreed to* -- the simplified state model this is intentionally left at; RFC 1143/Q-method tracking is not being built ahead of a real need for it. Adding SGA, NAWS or TTYPE is adding a case to the negotiator, not a new design.

A subtlety `TelnetNegotiator`'s tests exist to pin down: sending `IAC WILL ECHO` (`setEcho(false)`) makes a well-behaved client reply `IAC DO ECHO`, acknowledging it. That acknowledgment must not itself be answered with `WONT` (the negotiator's default for an unsolicited `DO`) -- that would contradict what was just offered a moment earlier. The negotiator recognizes its own pending option and stays quiet for that one reply.

The renderer sits on the `Session` the transport builds, so an adapter's semantic output is worded at the edge:

```text
bytes -> TelnetConnection -> engine.receive -> handler -> AberOutput
      -> session.send -> renderOutput -> connection.write -> bytes
```

`test/engine-flow.test.ts` and `test/telnet-vertical-slice.test.ts` prove that whole path over a real socket -- see below. It is the composition an app will eventually own; both live here only because no app exists yet, which is why this package has the adapter as a dev dependency.

## The AberMUD login flow moved out

`runAberMUDLogin` used to live here, in `test/support/abermud-login.ts`. It now lives in `@stratamu/adapter-abermud` (`src/login/`), because it is AberMUD- and `Engine`-specific composition, not a Telnet concern: prompting wording, when to authenticate, what "logged in" means for a character, all game/account policy, none of it about the wire. This package should be usable by any adapter, not carry one adapter's login flow.

The move needed no new dependency either direction. `AberMUDLoginConnection` (declared in `adapter-abermud`) is a small structural interface -- line-oriented input/output plus `setEcho` -- and `TelnetConnection` already satisfies it. `adapter-abermud` never imports this package; this package's tests import `runAberMUDLogin` from `adapter-abermud` (a dev dependency, same as before) to prove the seam actually works, since this package has no socket of its own to prove it with:

- `test/abermud-login.test.ts`: prompts, echo suppression bracketing only the password, a full login through `LOOK`, a wrong-password retry, and the concurrent-input guard -- all over a real socket. The login *logic* itself (state transitions, the guard, the echo-timing fix) has its own faster tests against a fake connection in `adapter-abermud`; what belongs here is that a real `TelnetConnection` actually satisfies what the login flow needs.
- `test/telnet-vertical-slice.test.ts`: the complete path in one connection -- a client's own option negotiation (an unsupported `TTYPE` offer), interleaved with the Name/Password exchange rather than arriving neatly before or after it, followed by authentication, character control, and a rendered `LOOK` response. Nothing in the test wires the codec, negotiator, decoder or login flow together by hand -- `createLineServer` already does that, and `adapter-abermud` already does the rest -- and this is what proves the result is one coherent path, not each piece merely tested in isolation, with the Telnet plugin importing nothing AberMUD-specific to make it happen.

## Findings from the spike

- **`Engine.receive` does not run anything.** It parses and submits; the `Runtime` has to be stepped by someone. `Runtime.drain()` is documented as a test convenience, "not a model of a server loop", and runs to exhaustion -- never returning for a handler that keeps rescheduling itself. `runAberMUDLogin` (now in `adapter-abermud`) uses `Runtime.pump(maxSteps)` instead: a bounded sibling that always returns. See `docs/EXECUTION_POLICY.md` in the main repository for why bounded execution needed no new mechanism in `Runtime` itself, and `engine-core`'s own README for `pump`.
- **Input can arrive before login finishes.** Not an issue once a connection actually goes through `runAberMUDLogin`: a line sent before the name/password exchange finishes is consumed by the login state machine, not lost or misrouted to game commands.
- **Two writes sent back to back can arrive as one TCP chunk.** `test/abermud-login.test.ts`'s reprompt case (`"Login incorrect.\r\n"` immediately followed by `"Name: "`) exposed this: a test helper computing "the position to search after" from the *buffer's length once everything has arrived* is wrong once the next prompt is already in that same chunk. The fix is to have the helper return where its own match ended, not read the buffer's length back out afterward (see `test/support/receiver.ts`).
- **Echo was being restored too early, and a line sent while authentication was pending was a real bug.** Both fixed in `runAberMUDLogin`, now documented in `adapter-abermud`'s own README alongside the code.
- **`Connection` was doing two jobs.** `setEcho` and `onCommand` are Telnet-specific, but they lived on the one `Connection` type every caller saw, so nothing distinguished "this needs Telnet" from "this only needs lines." Split into `Connection` (the generic shape) and `TelnetConnection extends Connection` (adds the two Telnet-only members).

## Not yet

- SGA, NAWS, TTYPE in `TelnetNegotiator`.
- Negotiated client capabilities (terminal type, window size) exposed to an adapter.
- A generic `Session.send`, or a renderer signature that takes client capabilities.
- Backpressure and write buffering.
- An app to own the composition `test/engine-flow.test.ts` and `test/telnet-vertical-slice.test.ts` currently prove by real-socket test instead.
