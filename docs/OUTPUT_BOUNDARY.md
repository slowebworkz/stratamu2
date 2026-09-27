# Output Boundary

## Status

**Investigation; room views and refusals implemented.** This inventories the output the engine actually produces today, classifies what it communicates, and proposes a candidate vocabulary. `Session.send(message: unknown)` is unchanged.

Scope is deliberately narrow: semantic output, not a presentation framework. Telnet/ANSI/web rendering, line wrapping, colour and prompts-as-transport stay out of the engine. See [SESSION_BOUNDARY.md](SESSION_BOUNDARY.md) for why output is a handler side effect through `Session.send` rather than a `Task` result; that decision is not reopened here.

## The seam

`Session.send(message: unknown)` in `@stratamu/engine-sessions`. Every handler builds a finished English string and passes it to `send`, so **the handlers currently do the presentation**: wording, punctuation, line breaks and list formatting live inside game logic. Any transport receives prose and can only print it.

## Inventory

Everything below is what handlers send today (`adapters/abermud/src/commands/`, plus `adapters/test/src/test-adapter.ts`, which mirrors the same shapes).

| Command | Recipient | Output | Kind |
| --- | --- | --- | --- |
| LOOK | self | room name, description, and an "Also here: ..." occupant line | room view |
| MOVE (ok) | self | the same room view for the arrival room | room view |
| MOVE (fail) | self | "you can't go that way" | refusal |
| EXITS | self | "obvious exits: ..." or "there are no obvious exits" | exit list |
| SAY | self, then each other occupant | `You say, "..."` / `X says, "..."` | speech |
| TELL | self, then the target | `You tell X, "..."` / `X tells you, "..."` | speech (directed) |
| WHO | self | "online: ..." or "no one else is online" | player list |
| SAVE (ok) | self | "Saving NAME" | confirmation |
| any | self | "you are not controlling a character" | refusal |
| LOOK, EXITS | self | "you are nowhere" | refusal |
| TELL | self | "X is not here" | refusal |
| SAVE | self | "saving is not available" / "you have no status to save" | refusal |
| prompts | — | none. Login models the interactive prompt as *input*, not output | — |

## What is actually being communicated

Reading the table by meaning rather than wording, the output falls into a few groups:

1. **A view of a place**: room name, description, who else is there. Emitted by two commands.
2. **A fact list**: exits, online players.
3. **Something a character said**, with a speaker, a text, and a direction (to self, to others, to one target). The same event is worded differently depending on who receives it ("You say" vs "X says").
4. **A confirmation** that an action happened.
5. **A refusal**: an action could not be performed, for a reason. Six distinct reasons appear; three are shared across commands ("not controlling a character" appears in every command).

Two things worth noticing:

- **Per-recipient wording is a presentation concern, not a game fact.** SAY and TELL each send two different strings for one event. The event has a speaker and a text; "You" vs "X" is how a viewer is addressed.
- **`Also here: ${occupantIds}` prints entity ids, not names.** `WorldState` deliberately has no name or attributes yet, so semantic output that names entities will need either the adapter to resolve names, or output to carry `EntityId`s and let presentation look them up. That is an unresolved question this work exposes rather than settles.

## Candidate vocabulary

Not a proposal to build all of these. This is the smallest set the current commands justify, listed so the first implementation step can pick one and prove it:

- `room` — `{ name, description, occupants }`
- `exits` — `{ directions }`
- `speech` — `{ speaker, text, to }`, where `to` distinguishes room-wide from directed
- `players` — `{ names }`
- `refusal` — `{ reason }`, with a closed set of reason codes (`not-controlling`, `nowhere`, `no-exit`, `target-absent`, `save-unavailable`, `nothing-to-save`)
- `notice` — a plain confirmation (`Saving NAME`), likely folded into a `saved` fact rather than kept generic

Explicitly not in the vocabulary: anything transport-shaped (`TelnetMessage`, `ANSIMessage`, `WebMessage`), colour, layout, or prompts.

## Intended shape

```text
Engine handler
    │  emits GameOutput (facts)
    ▼
Session.send(output: GameOutput)
    │
Presentation   ← owns wording, "You" vs "X", colour, layout
   /      \
Telnet    Web
```

The engine states what happened. Presentation decides how it reads.

## Open questions

1. **Names.** Who resolves an `EntityId` to something displayable: the adapter before emitting, or presentation after receiving? Depends on where names live once `WorldState` (or an adapter) holds them.
2. **Where the type lives.** `Session.send` is in `engine-sessions`, but the *vocabulary* is game-level and the adapter defines the games. Likely a generic envelope in the engine and adapter-owned variants, or the whole type adapter-owned with `send` generic over it. Not decided.
3. **Migration order.** Converting one command (LOOK/MOVE share `describeRoom`, so they move together) before touching the rest keeps each step reviewable.
4. **Multiple sessions per principal.** Still deliberately unsolved; it only matters to output once fan-out to a principal's several sessions is real.

## First step, done: room views

`describeRoom` (shared by LOOK and MOVE) now returns a `RoomOutput` (`{ kind: "room", name, description, occupants }`) and the handlers send that object. `renderRoom` in `adapters/abermud/src/output.ts` is the presentation half and reproduces the old text exactly. Every other command still sends a string, so `send` still takes `unknown` and sessions currently see a mix.

What real code answered:

- **Where the type lives:** adapter-owned. The vocabulary is game-level, and `RoomOutput` needed nothing from the engine. `Session.send` stays `unknown` until a second adapter or several output kinds justify a shared envelope.
- **Names:** unanswered. Occupants are still entity ids, exactly as before, and `RoomOutput` carries them as `EntityId`s, so resolving names remains presentation's or the adapter's job later.
- **"You are nowhere":** left as a string. It is a refusal and moves with the refusal vocabulary, not with `room`.

## Second step, done: refusals

All six refusals now send a `RefusalOutput` (`{ kind: "refusal", reason }`) built by `refusal(...)`, and `renderRefusal` in `adapters/abermud/src/output.ts` holds the wording. "you are nowhere" is now a `nowhere` refusal in LOOK, MOVE and EXITS.

What it answered:

- **A closed reason set holds.** Five reasons are bare codes. `target-absent` is the exception: it carries the target as the player typed it, because the refusal is about that input, not a resolved entity. `refusal()` is overloaded so a target can only be supplied for that reason.
- **Shared reasons are now shared.** `not-controlling` was six copies of one string; it is one code, worded once.
- **Handlers no longer contain any refusal wording.** Only confirmations, speech, exits and the player list are still prose.

## Next step

Convert speech (SAY, TELL). It is the harder test: one event, two recipients, different wording, so it decides whether `speech` carries a speaker and a direction, and where "You" vs "X" gets decided.
