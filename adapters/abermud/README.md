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
- SAVE

**Needs target-specific verification** (present here as conventional MUD syntax, not yet checked
against the AberMUD II source itself):

- `L` as a LOOK abbreviation
- EXITS, and `EX` as its abbreviation
- `GO <direction>` / `JUMP <direction>`

No more aliases or commands should be added on the strength of "that's how MUDs usually work" --
that is exactly how a concrete adapter quietly turns back into a generic one. Each addition should
be checked against AberMUD II's own recovered source or documentation first.

## Reference

The recovered AberMUD II source, `github.com/DavidKinder/AberMUD2` (repaired to build and run on
a modern Unix-like system), and its accompanying documentation are the authority for what counts
as correct behavior here -- read directly, not recalled from memory, and not part of this
repository; see "Non-goals". Persistence specifically was checked against `mud/newuaf.c`'s
`personactl()`/`putpers()`/`delpers()` (record scan, in-place overwrite, slot reuse, blank-on-
delete -- there is no separate "is this slot empty" check in the source at all: an empty slot's
name genuinely *is* `""`, found by the exact same scan used to find anything else),
`saveme()`/`initme()` (SAVE and a future LOGIN go through the same file, not separate load/save
abstractions; SAVE's exact message, `"Saving %s"`, is `saveme()`'s own, not invented here),
`validname()` (the 10-character name rule, plus reserved words and a check against object names
this adapter does not implement yet), and `mud/makeuaf.c` (a fresh run of it produces a single
"Debugger" record).

`mud/makeuaf.c` was also compiled and actually run (x86_64, LP64, little-endian), not just read:
`test/uaf-rand-codec.test.ts` checks `UafRandCodec` against those genuine captured bytes, not only
against itself. That run surfaced a real fact worth recording: `struct uaf_being x` is a local,
never zero-initialized in C, so the bytes after a name's NUL terminator differed between two runs
of the identical program. `UafRandCodec` deliberately zero-pads that region instead of leaving it
undefined, and decodes a name by stopping at the *first* NUL (matching what `strcmp`/`lowercase`
in the source actually do), not by stripping a trailing run of them -- checked against those same
genuine garbage bytes, not a synthetic example.

## Non-goals

- **Not a source port.** The adapter does not translate, embed, or otherwise reuse AberMUD's
  original C implementation. It independently reimplements the game's behavior on top of
  Stratamu's engine primitives. The recovered AberMUD II source and documentation serve as the
  behavioral reference, not as code this adapter builds on.
- **Not the original world data.** AberMUD's original world/scenario is copyrighted and
  redistributable only under its own stated conditions. This package uses its own small test
  world (`test/fixtures/`) to exercise behavior in isolation, never the historical one.
- **Not currently promising general historical file-format compatibility** -- world files,
  configuration files, network protocol, or the original server implementation. It may
  progressively implement AberMUD's traditional persistence *semantics* where those semantics are
  required by gameplay behavior, as SAVE now does for `uaf.rand` (see "What exists"): that is a
  narrower, different claim from "this adapter can load arbitrary historical AberMUD
  installations," and should not be read as one.

  | Goal | Current adapter |
  | --- | --- |
  | Emulate gameplay behavior | Yes -- this is the goal |
  | Reproduce command behavior | Yes |
  | Reproduce game rules | Yes, as each slice implements them |
  | Use the original C source | No |
  | Port the original implementation | No |
  | Implement a command's traditional persistence semantics, where gameplay requires it | Yes, incrementally -- SAVE/`uaf.rand` first |
  | Load the original world files | Not currently |
  | Load an existing historical installation's actual save data | Not currently -- see `UafRandCodec`'s own caveats |
  | Interoperate with an original AberMUD server | Not currently |

## What exists

- `AberMUDAdapter` (`adapter.ts`): the composition root. Implements `@stratamu/engine-core`'s
  `EngineAdapter<SessionInput>`. Owns `charactersByName` (name -> character, for TELL/WHO),
  `control` (character -> who plays it), `personas` (a controlled character's live
  score/strength/sex/level -- see `persistence/` below), and AberMUD's own room/mobile/object
  definitions. Contains no command logic itself. Takes an `AberMUDAdapterOptions` with an
  optional `personaStore`; SAVE tells the player saving isn't available without one.
- `parser.ts`: `SessionInput -> Work[]`. The only place raw command text is read.
- `commands/`: one file per command (`look`, `exits`, `move`, `save`, `say`, `tell`, `who`), each
  owning its `WorkKind` and handler.
- `control.ts`: `Control` (`PrincipalId -> EntityId`) and `principalControlling`, the reverse
  lookup `say`/`tell`/`who` all need.
- `world/`: AberMUD's own room/mobile/object definitions -- not `WorldState`'s generic `Entity`.
  `AberRoomDefinition.number` preserves AberMUD's own historical room numbering (its archive
  stores room text under `TEXT/ROOMS/<number>`) alongside the `EntityId` used everywhere else in
  this engine.
- `persistence/`: driven by what SAVE alone needs -- no `WorldStore`, `AccountStore`,
  `RoomStore`, or the rest, until a command actually needs one.
  - `persona.ts` -- `AberMUDPersona`: name, score, strength, sex, level, matching the recovered
    source's `struct uaf_being`.
  - `uaf-rand-codec.ts` -- `UafRandLayout` and `UafRandCodec`: `AberMUDPersona <-> uaf.rand`'s
    fixed-width binary record, isolated from the filesystem so it can be tested as bytes in,
    bytes out. The historical platform's exact `long` width and byte order are not pinned down by
    the C struct declaration alone, so the codec takes an explicit `UafRandLayout`
    (`{ longBytes: 4 | 8; endian }`) instead of assuming one.
    `RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN` (8-byte LP64, little-endian) is what compiling and
    running the recovered source actually produces on that ABI -- verified, not guessed (see
    "Reference") -- but not yet confirmed to match any genuine historical 32-bit deployment. A
    16-byte name field is a data-format fact; AberMUD's own 10-character name limit
    (`validname()`) is a separate game rule this codec deliberately does not enforce.
  - `uaf-rand-file.ts` -- `UafRandFile`: `uaf.rand` as AberMUD's own fixed-record file with slot
    reuse and in-place updates, reproducing the *observable* semantics of
    `personactl()`/`putpers()`/`delpers()`, not their I/O mechanics (no `fseek`/`fread`/`fwrite`
    on one open handle -- this reads the whole file per operation instead, fine at `uaf.rand`'s
    real scale). `find`/`save` match a name case-insensitively (both sides lowercased before
    comparing, as the source does), but `save` writes the name exactly as given, unchanged case.
    There is one matching function, not a name-match plus a separate emptiness check: a new
    persona reuses the first record whose name is literally `""` before the file is extended,
    exactly how `putpers()` itself finds a free slot (`personactl("",&s,PCTL_FIND)`); `delete`
    blanks every record matching a name (cleared name, level set to `-1`) in place rather than
    compacting the file, looping the way `delpers()` does rather than assuming only one match.
  - `file-persona-store.ts` -- `AberMUDPersonaStore` (the narrow `save`/`load` contract SAVE, and
    eventually LOGIN, both need -- no `delete`, since no command needs one yet) and
    `FilePersonaStore`, a thin wrapper over one `UafRandFile`.

  `test/uaf-rand-codec.test.ts` proves the codec alone, including against real bytes captured
  from actually compiling and running `mud/makeuaf.c` (see "Reference") -- not just a round trip
  through itself. `test/uaf-rand-file.test.ts` proves the slot semantics above.
  `test/file-persona-store.test.ts` only proves the thin wrapper delegates correctly, through a
  *fresh* instance -- a real round trip, the way a process restart would use it.

`personas` answers a question SAVE forced: generic `Entity`/`WorldState` deliberately carry no
notion of score/strength/sex/level, so where does a character's live status live while the game
is running? Here, adapter-owned, the same way `rooms`/`control` already are -- not by enlarging
`Entity`.

Deliberately minimal beyond that: no containment or equipment (`get`/`drop`/`wear`/`put`), no
combat, no LOGIN/QUIT/RESET, no world-file or account persistence. The natural next slice is
LOGIN/load, since it proves the other half of the persistence boundary SAVE only writes into.
Each is meant to force whatever the next real abstraction turns out to be, rather than be
designed in ahead of that evidence.

## Public API

`AberMUDAdapter`, `AberMUDAdapterOptions`, `SessionInput`, `Control`, `AberRoomDefinition`,
`AberMobileDefinition`, `AberObjectDefinition`, `AberMUDPersona`, `AberMUDPersonaStore`,
`FilePersonaStore` -- how to compose and use the adapter, and what to implement or supply for
persistence. Work kinds, the parser, `UafRandCodec`, and each command's handler are internal.
