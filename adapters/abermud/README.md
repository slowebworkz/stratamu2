# @stratamu/adapter-abermud

**Target:** AberMUD II. The recovered source identifies itself inconsistently -- its startup
banner says Unix release 1.12, its `distrib` file says release 3.7.14 -- while its files are
internally consistent, so both numbers are recorded rather than one being treated as canonical:

- Unix release 1.12
- distribution release 3.7.14

**Purpose:** an architectural test adapter that reimplements the gameplay behavior of a specific,
real, pre-existing game system -- AberMUD II -- on top of `@stratamu/engine-core`'s
`Runtime`/`Engine`, `@stratamu/engine-world`'s `WorldState`, and `@stratamu/engine-sessions`'s
`Sessions`. The goal is not "implement some semantics inspired by AberMUD II"; it is to reproduce
AberMUD II's actual game behavior without importing or porting its implementation. The recovered
AberMUD II source and documentation are the behavioral specification; Stratamu supplies the
implementation architecture. Concretely:

```text
AberMUD II (historical game behavior)
        |  behavioral reference
        v
@stratamu/adapter-abermud (independent reimplementation)
        |  engine API
        v
Stratamu (generic runtime / world / sessions)
```

**The governing rule:** when Stratamu's architecture differs from AberMUD's implementation,
preserve the AberMUD *behavior*, not the AberMUD *implementation*. AberMUD's own implementation
(C, global structs, a shared file, `flock()`, a two-second polling loop) is not something this
adapter has any obligation to, or reason to, reproduce -- only what a player observes is. If
AberMUD's SAY produces a particular speaker message and a particular room message, this adapter
should produce those same messages; how it gets there (`Work` -> `Task` -> `Runtime` ->
`WorldState`, nothing like AberMUD's own architecture) is exactly what this experiment is testing.

## Compatibility scope

Currently only a small slice of commands, and within that slice, not every command is equally
well-established against the source:

**Known / strongly justified** (AberMUD's documented command vocabulary):

- LOOK
- movement: N/S/E/W/U/D and the full direction words
- SAY
- TELL
- WHO

**Needs target-specific verification** (present here as conventional MUD syntax, not yet checked
against the AberMUD II source itself):

- `L` as a LOOK abbreviation
- EXITS, and `EX` as its abbreviation
- `GO <direction>` / `JUMP <direction>`

No more aliases or commands should be added on the strength of "that's how MUDs usually work" --
that is exactly how a concrete adapter quietly turns back into a generic one. Each addition should
be checked against AberMUD II's own recovered source or documentation first.

## Reference

The recovered AberMUD II source (repaired to build and run on a modern Unix-like system) and its
accompanying documentation are the authority for what counts as correct behavior here -- an
executable reference, not just historical description. That source is not part of this repository;
see "Non-goals".

## Non-goals

- **Not a source port.** The adapter does not translate, embed, or otherwise reuse AberMUD's
  original C implementation. It independently reimplements the game's behavior on top of
  Stratamu's engine primitives. The recovered AberMUD II source and documentation serve as the
  behavioral reference, not as code this adapter builds on.
- **Not the original world data.** AberMUD's original world/scenario is copyrighted and
  redistributable only under its own stated conditions. This package uses its own small test
  world (`test/fixtures/`) to exercise behavior in isolation, never the historical one.
- **Not an interoperability/format compatibility layer.** The adapter is intended to emulate
  AberMUD II's gameplay behavior, but it does not currently promise compatibility with AberMUD
  II's world files, player files, configuration files, network protocol, or original server
  implementation:

  | Goal | Current adapter |
  | --- | --- |
  | Emulate gameplay behavior | Yes -- this is the goal |
  | Reproduce command behavior | Yes |
  | Reproduce game rules | Yes, as each slice implements them |
  | Use the original C source | No |
  | Port the original implementation | No |
  | Load the original world files | Not currently |
  | Load the original player files | Not currently |
  | Interoperate with an original AberMUD server | Not currently |

## What exists

- `AberMUDAdapter` (`adapter.ts`): the composition root. Implements `@stratamu/engine-core`'s
  `EngineAdapter<SessionInput>`. Owns `charactersByName` (name -> character, for TELL/WHO),
  `control` (character -> who plays it), and AberMUD's own room/mobile/object definitions.
  Contains no command logic itself.
- `parser.ts`: `SessionInput -> Work[]`. The only place raw command text is read.
- `commands/`: one file per command (`look`, `exits`, `move`, `say`, `tell`, `who`), each owning
  its `WorkKind` and handler.
- `control.ts`: `Control` (`PrincipalId -> EntityId`) and `principalControlling`, the reverse
  lookup `say`/`tell`/`who` all need.
- `world/`: AberMUD's own room/mobile/object definitions -- not `WorldState`'s generic `Entity`.
  `AberRoomDefinition.number` preserves AberMUD's own historical room numbering (its archive
  stores room text under `TEXT/ROOMS/<number>`) alongside the `EntityId` used everywhere else in
  this engine.

Deliberately minimal: no containment or equipment (`get`/`drop`/`wear`/`put`), no combat, no
persistence, no reset/spawn. Each is a later slice, meant to force whatever the next real
abstraction turns out to be, rather than be designed in ahead of that evidence.

## Public API

`AberMUDAdapter`, `SessionInput`, `Control`, `AberRoomDefinition`, `AberMobileDefinition`,
`AberObjectDefinition` -- how to compose and use the adapter. Work kinds, the parser, and each
command's handler are internal.
