# @stratamu/plugin-telnet

Network I/O for the engine, as a **plugin**: replaceable infrastructure, not game semantics and not core. The engine and adapters never see a socket; they see a `Connection` (lines in, text out) and a `Session` someone built around it.

**Status:** spike. Private and unpublished.

## What exists

- `createLineServer(onConnection)`: accepts TCP connections and hands each to `onConnection` as a `Connection`.
- `Connection`: `onLine`, `onCommand`, `onClose`, `setEcho`, `write`, `close`. Says nothing about what is on the wire beyond that split.
- `TelnetCodec`: parses the Telnet wire protocol (IAC, option negotiation, subnegotiation, escaping) out of a raw byte stream. Reports what the client sent; answers nothing.
- `TelnetNegotiator`: answers what the codec reports. Implements one option, ECHO (`Connection.setEcho`, for password prompts); refuses everything else per RFC 854, so a real client's negotiation for NAWS, TTYPE or anything else gets a reply instead of hanging.
- `LineBuffer`: application bytes in, complete lines out (`\n` or `\r\n`, split packets).

The wire path is:

```text
TCP chunks -> TelnetCodec -> application bytes -> StringDecoder (UTF-8) -> LineBuffer -> onLine
                           -> Telnet commands -> TelnetNegotiator (answers) --and--> onCommand
```

Telnet parsing happens before UTF-8 decoding, deliberately: `IAC` is a byte value (`0xff`) that can appear inside a multi-byte UTF-8 sequence, so decoding first would risk splitting a command out of the wrong place. `StringDecoder` only ever sees application bytes, and stays responsible for a UTF-8 sequence split across TCP chunks, same as before the codec existed.

**Implemented:** TCP transport, line framing, UTF-8 decoding, Telnet IAC parsing, Telnet command and subnegotiation extraction (`TelnetCodec`), Telnet option-negotiation policy for ECHO with a default refusal for everything else (`TelnetNegotiator`).

**Not yet:** SGA, NAWS, TTYPE, a login flow that actually calls `setEcho`, negotiated client capabilities exposed to an adapter, output negotiation.

## The boundary this is meant to keep

This package owns *mechanism* and Telnet *option policy* -- sockets, framing, the wire grammar, and answering a negotiation -- not *game* policy: a login flow, wording, colour, input preprocessing. That stays with a game's adapter, written against `Connection`.

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

`TelnetCodec` is considered done: it reports every command shape RFC 854 and the option-negotiation RFCs define, distinguishes a genuinely unrecognized command byte (`unknown`) from a known signal, and recovers from malformed input (an `IAC` inside a subnegotiation followed by neither `IAC` nor `SE`) without hanging or corrupting later input. `TelnetNegotiator` has exactly one option implemented; adding SGA, NAWS or TTYPE is adding a case there, not a new design.

A subtlety `TelnetNegotiator`'s tests exist to pin down: sending `IAC WILL ECHO` (`setEcho(false)`) makes a well-behaved client reply `IAC DO ECHO`, acknowledging it. That acknowledgment must not itself be answered with `WONT` (the negotiator's default for an unsolicited `DO`) -- that would contradict what was just offered a moment earlier. The negotiator recognizes its own pending option and stays quiet for that one reply.

The renderer sits on the `Session` the transport builds, so an adapter's semantic output is worded at the edge:

```text
bytes -> Connection -> engine.receive -> handler -> AberOutput
      -> session.send -> renderOutput -> connection.write -> bytes
```

`test/engine-flow.test.ts` proves that whole path over a real socket. It is the composition an app will eventually own; it lives here only because no app exists yet, which is why this package has the adapter as a dev dependency.

## Findings from the spike

- **`Engine.receive` does not run anything.** It parses and submits; the `Runtime` has to be stepped by someone. `Runtime.drain()` is documented as a test convenience, "not a model of a server loop". The composition here calls it after each line, which is enough for a proof but is not a design. Who steps the runtime, and how often, is the next I/O question.
- **Input can arrive before login finishes.** A connection is live before its character exists, so a line sent too early finds no character to act for. Real login prompts are what will gate this; the test waits for a greeting instead.

## Not yet

- SGA, NAWS, TTYPE in `TelnetNegotiator`.
- A login flow that calls `Connection.setEcho` around password entry.
- Negotiated client capabilities (terminal type, window size) exposed to an adapter.
- A generic `Session.send`, or a renderer signature that takes client capabilities.
- Backpressure and write buffering.
