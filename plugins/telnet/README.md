# @stratamu/plugin-telnet

Network I/O for the engine, as a **plugin**: replaceable infrastructure, not game semantics and not core. The engine and adapters never see a socket; they see a `Connection` (lines in, text out) and a `Session` someone built around it.

**Status:** spike. Private and unpublished. Raw TCP line I/O only; not yet Telnet.

## What exists

- `createLineServer(onConnection)`: accepts TCP connections and hands each to `onConnection` as a `Connection`.
- `Connection`: `onLine`, `onClose`, `write`, `close`. Says nothing about what is on the wire.
- `LineBuffer`: chunks in, complete lines out (`\n` or `\r\n`, split packets, UTF-8 across chunk boundaries via the server's decoder).

## The boundary this is meant to keep

This package owns *mechanism*: sockets, framing, and (later) Telnet negotiation and the capabilities a client negotiated. Whatever varies by game, such as the login flow, which options to offer, input preprocessing, colour and paging, is adapter policy and lives with the adapter, written against `Connection`.

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

- Telnet: IAC parsing, option negotiation, charset, and exposing negotiated capabilities. IAC bytes currently pass through as text, so `nc` works but a real Telnet client's negotiation will show up in the input.
- A login flow, and the request for "don't echo the next line" it will need.
- A generic `Session.send`, or a renderer signature that takes client capabilities.
- Backpressure and write buffering.
