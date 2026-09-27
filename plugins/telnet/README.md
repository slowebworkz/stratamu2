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

**Implemented:** TCP transport, line framing, UTF-8 decoding, Telnet IAC parsing, Telnet command and subnegotiation extraction (`TelnetCodec`), Telnet option-negotiation policy for ECHO with a default refusal for everything else (`TelnetNegotiator`), a Name/Password login flow that uses `setEcho` around the password (`test/support/abermud-login.ts`, proven over a real socket in `test/abermud-login.test.ts`).

**Not yet:** SGA, NAWS, TTYPE, interactive new-character creation (the login flow only works for a name with an existing persona), negotiated client capabilities exposed to an adapter, output negotiation.

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
                                                                     Connection -> Engine
```

`TelnetCodec` and `TelnetNegotiator` are both frozen for now: no more abstraction in either, and their current tests are the protocol contract. `TelnetCodec` reports every command shape RFC 854 and the option-negotiation RFCs define, distinguishes a genuinely unrecognized command byte (`unknown`) from a known signal, and recovers from malformed input (an `IAC` inside a subnegotiation followed by neither `IAC` nor `SE`) without hanging or corrupting later input. `TelnetNegotiator` has exactly one option implemented, tracking only what was last *sent*, not what the client *agreed to* -- the simplified state model this is intentionally left at; RFC 1143/Q-method tracking is not being built ahead of a real need for it. Adding SGA, NAWS or TTYPE is adding a case to the negotiator, not a new design.

A subtlety `TelnetNegotiator`'s tests exist to pin down: sending `IAC WILL ECHO` (`setEcho(false)`) makes a well-behaved client reply `IAC DO ECHO`, acknowledging it. That acknowledgment must not itself be answered with `WONT` (the negotiator's default for an unsolicited `DO`) -- that would contradict what was just offered a moment earlier. The negotiator recognizes its own pending option and stays quiet for that one reply.

The renderer sits on the `Session` the transport builds, so an adapter's semantic output is worded at the edge:

```text
bytes -> Connection -> engine.receive -> handler -> AberOutput
      -> session.send -> renderOutput -> connection.write -> bytes
```

`test/engine-flow.test.ts` proves that whole path over a real socket. It is the composition an app will eventually own; it lives here only because no app exists yet, which is why this package has the adapter as a dev dependency.

`test/support/abermud-login.ts` is that same kind of composition, one layer up: `runAberMUDLogin` prompts for a name, then a password with `TelnetConnection.setEcho(false)` held through the whole authentication call (not just while the password is being typed -- see "Findings" below), calls `AberMUDAdapter.authenticate`, and on success opens a `Session` and switches the connection over to `engine.receive` -- the hand-off `engine-flow.test.ts` used to do by authenticating up front. It stays in `test/support`, not `src`, for the same reason: it is AberMUD- and Engine-specific composition, not a generic `Connection` or Telnet concern, and no app exists yet to own it.

`test/telnet-vertical-slice.test.ts` is the complete path in one connection: a client's own option negotiation (an unsupported `TTYPE` offer), interleaved with the Name/Password exchange rather than arriving neatly before or after it, followed by authentication, character control, and a rendered `LOOK` response. Nothing in the test wires the codec, negotiator, decoder or login flow together by hand -- `createLineServer` already does that, and this is what proves the result is one coherent path, not each piece merely tested in isolation.

## Findings from the spike

- **`Engine.receive` does not run anything.** It parses and submits; the `Runtime` has to be stepped by someone. `Runtime.drain()` is documented as a test convenience, "not a model of a server loop". The composition here calls it after each line, which is enough for a proof but is not a design. Who steps the runtime, and how often, is the next I/O question.
- **Input can arrive before login finishes.** No longer true once a connection actually goes through `runAberMUDLogin`: a line sent before the name/password exchange finishes is consumed by the login state machine, not lost or misrouted to game commands.
- **Two writes sent back to back can arrive as one TCP chunk.** `test/abermud-login.test.ts`'s reprompt case (`"Login incorrect.\r\n"` immediately followed by `"Name: "`) exposed this: a test helper computing "the position to search after" from the *buffer's length once everything has arrived* is wrong once the next prompt is already in that same chunk. The fix is to have the helper return where its own match ended, not read the buffer's length back out afterward (see `test/support/receiver.ts`).
- **Echo was being restored too early.** The first version of `runAberMUDLogin` called `setEcho(true)` immediately on receiving the password line, before `AberMUDAdapter.authenticate` was even called -- correct for "stop hiding what's typed", but it left echo restored for the whole (async) authentication call for no reason. It now restores echo once `authenticate` resolves, whichever way, so suppression actually brackets the full password/authentication window.
- **A line sent while `authenticate` is still pending was a real bug, not a theoretical one.** `authenticate` is async, and nothing stopped a second line -- even one arriving in the very same TCP chunk as the password, so no timing luck involved -- from being read as stage `"password"` too, starting a second, concurrent `authenticate` call. Confirmed by reverting the fix locally: the test then genuinely fails, with a stray `"Login incorrect."` and reprompt landing after `"ready"`. Fixed with an explicit `"authenticating"` stage that drops any line arriving before the pending call (both `authenticate` and the `adapter.login` that follows it) resolves, rather than trying to queue it.
- **`Connection` was doing two jobs.** `setEcho` and `onCommand` are Telnet-specific, but they lived on the one `Connection` type every caller saw, so nothing distinguished "this needs Telnet" from "this only needs lines." Split into `Connection` (the generic shape) and `TelnetConnection extends Connection` (adds the two Telnet-only members); `createLineServer` hands out a `TelnetConnection`, and anything -- `runAberMUDLogin`, say -- that specifically needs `setEcho` now says so in its own parameter type.

## Not yet

- SGA, NAWS, TTYPE in `TelnetNegotiator`.
- Interactive new-character creation. `runAberMUDLogin` always passes `sex: 0` to `AberMUDAdapter.login`, so it only actually succeeds for a name with an existing persona; prompting for `sex` to create a new one is a separate, larger flow.
- A retry limit on login; a wrong password reprompts indefinitely rather than eventually disconnecting.
- Negotiated client capabilities (terminal type, window size) exposed to an adapter.
- A generic `Session.send`, or a renderer signature that takes client capabilities.
- Backpressure and write buffering.
