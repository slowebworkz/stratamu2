# @stratamu/plugin-telnet

Network I/O for the engine, as a **plugin**: replaceable infrastructure, not game semantics and not core. The engine and adapters never see a socket; they see a `Connection` (lines in, text out) and a `Session` someone built around it.

**Status:** spike. Private and unpublished.

## What exists

- `createLineServer(onConnection)`: accepts TCP connections and hands each to `onConnection` as a `Connection`.
- `Connection`: `onLine`, `onCommand`, `onClose`, `write`, `close`. Says nothing about what is on the wire beyond that split.
- `TelnetCodec`: parses the Telnet wire protocol (IAC, option negotiation, subnegotiation, escaping) out of a raw byte stream. Reports what the client sent; answers nothing.
- `LineBuffer`: application bytes in, complete lines out (`\n` or `\r\n`, split packets).

The wire path is:

```text
TCP chunks -> TelnetCodec -> application bytes -> StringDecoder (UTF-8) -> LineBuffer -> onLine
                           -> Telnet commands ------------------------------------------> onCommand
```

Telnet parsing happens before UTF-8 decoding, deliberately: `IAC` is a byte value (`0xff`) that can appear inside a multi-byte UTF-8 sequence, so decoding first would risk splitting a command out of the wrong place. `StringDecoder` only ever sees application bytes, and stays responsible for a UTF-8 sequence split across TCP chunks, same as before the codec existed.

**Implemented:** TCP transport, line framing, UTF-8 decoding, Telnet IAC parsing, Telnet command and subnegotiation extraction (`TelnetCodec`, with unit tests covering split chunks, escaping, and malformed input recovery).

**Not yet:** Telnet option negotiation *policy* (deciding which options to offer and answering `DO`/`WILL`), ECHO, SGA, NAWS, TTYPE, a login flow, negotiated client capabilities, output negotiation.

## The boundary this is meant to keep

This package owns *mechanism*: sockets, framing, and Telnet's wire grammar. It does not own *policy*: which options to offer, how to answer a negotiation, ECHO/SGA/NAWS/TTYPE, authentication, or anything about a specific game. That is either a game's adapter (login flow, wording, colour, input preprocessing) or, for Telnet option policy specifically, a `TelnetNegotiator` this package does not have yet:

```text
TCP socket -> TelnetCodec (wire grammar, state machine, escaping) -> TelnetEvent
                                                                          |
                                                                          v
                                                          TelnetNegotiator (option state,
                                                          ECHO, SGA, NAWS, TTYPE) -- not yet built
                                                                          |
                                                                          v
                                                                     Connection -> Engine
```

`TelnetCodec` is considered done for now: reports every command shape RFC 854 and the option-negotiation RFCs define, distinguishes a genuinely unrecognized command byte (`unknown`) from a known signal, and recovers from malformed input (an `IAC` inside a subnegotiation followed by neither `IAC` nor `SE`) without hanging or corrupting later input. The next work is `TelnetNegotiator`, not more of `TelnetCodec`.

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

- `TelnetNegotiator`: option state, and the first real option — ECHO, needed for password entry — followed by SGA, NAWS, TTYPE.
- A login flow, and the request for "don't echo the next line" it will need once ECHO exists.
- A generic `Session.send`, or a renderer signature that takes client capabilities.
- Backpressure and write buffering.
