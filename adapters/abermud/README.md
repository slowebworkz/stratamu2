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
- character initialization/load (adapter `login()`; not network/account authentication)
- GET, and its TAKE synonym
- DROP
- INVENTORY, and its I/INV abbreviations
- QUIT
- WIELD
- WEAR
- REMOVE

**Needs target-specific verification** (present here as conventional MUD syntax, not yet checked
against the AberMUD II source itself):

- `L` as a LOOK abbreviation
- EXITS, and `EX` as its abbreviation
- `GO <direction>` / `JUMP <direction>`

No more aliases or commands should be added on the strength of "that's how MUDs usually work" --
that is exactly how a concrete adapter quietly turns back into a generic one. Each addition should
be checked against AberMUD II's own recovered source or documentation first.

## Reference

The recovered AberMUD II source, [`github.com/DavidKinder/AberMUD2`](https://github.com/DavidKinder/AberMUD2)
(repaired to build and run on a modern Unix-like system), and its accompanying documentation are
the authority for what counts as correct behavior here -- read directly, not recalled from memory,
and not part of this repository; see "Non-goals". The files actually checked against, so far, and
what each one settled:

- [`mud/newuaf.c`](https://github.com/DavidKinder/AberMUD2/blob/master/mud/newuaf.c) --
  `personactl()`/`putpers()`/`delpers()` (record scan, in-place overwrite, slot reuse, blank-on-
  delete -- there is no separate "is this slot empty" check in the source at all: an empty slot's
  name genuinely *is* `""`, found by the exact same scan used to find anything else),
  `saveme()`/`initme()` (SAVE and a future LOGIN go through the same file, not separate load/save
  abstractions; SAVE's exact message, `"Saving %s"`, is `saveme()`'s own, not invented here),
  `validname()` (the 10-character name rule, plus reserved words and a check against object names
  this adapter does not implement yet).
- [`mud/makeuaf.c`](https://github.com/DavidKinder/AberMUD2/blob/master/mud/makeuaf.c) -- a fresh
  installation's single "Debugger" record.
- [`mud/objsys.c`](https://github.com/DavidKinder/AberMUD2/blob/master/mud/objsys.c) --
  `getobj()`/`dropitem()`/`inventory()`/`aobjsat()` for GET/DROP/INVENTORY: the exact messages
  (`"Ok..."`, `"OK.."`, `"Get what ?"`, `"Drop what ?"`, `"That is not here."`, `"You can't take
  that!"`, `"You are not carrying that."`), which checks gate which message (`ishere()` for GET's
  "not here", `oflannel()`/`obflannel()` -- `AberObjectDefinition.takeable`'s source -- for "can't
  take that", `iscarrby()` for DROP finding what the actor holds), and that a carried object's
  location and a room-located object's location are the same field (`oloc`, read by `ishere()` and
  `iscarrby()` alike) -- the fact `engine/world`'s containment-via-location design rests on. Not
  yet checked: `cancarry()`'s carry-capacity limit (a weight-based rule this adapter does not
  enforce), and the container support (`get X from Y`) `fobnin()`/`iscontin()` show the source has,
  which is out of scope until nested containment is.
- [`mud/parse.c`](https://github.com/DavidKinder/AberMUD2/blob/master/mud/parse.c) -- the verb
  table (`verbtxt`/`verbnum`), confirming GET and TAKE dispatch to the same handler, and I/INV/
  INVENTORY to the same one; `doaction()`'s case 8 for QUIT, which calls `dumpitems()`
  (`mud/objsys.c`'s `dumpstuff(mynum,curch)` -- every carried object relocated to the current
  room) and `saveme()` before ending the connection. Not reproduced: the source also clears the
  character's live name and removes it from the room's own linked list immediately; this adapter
  leaves the character's `WorldState` location alone instead, the same choice already made for an
  ordinary disconnect (see "What exists").
- [`mud/blood.c`](https://github.com/DavidKinder/AberMUD2/blob/master/mud/blood.c) --
  `weapcom()` for WIELD (`"Which weapon do you wish to select though"`, `"Whats one of those ?"`,
  `"Thats not a weapon"`, `"OK..."`), `dambyitem()` (a weapon's damage value only if the object
  has the weapon flag, `otstbit(it,15)`, else a fixed `4` for bare hands) and `hitplayer()` (not
  modeled yet -- combat itself; read to confirm that WIELD and WEAR are actually load-bearing for
  its damage/to-hit formula, not cosmetic, which is why they exist ahead of combat -- see "What
  exists").
- [`mud/new1.c`](https://github.com/DavidKinder/AberMUD2/blob/master/mud/new1.c) --
  `wearcom()`/`removecom()`/`canwear()`/`iswornby()`/`ohereandget()` for WEAR/REMOVE. `canwear()`
  is a third independent object flag (`otstbit(a,8)`), distinct from `takeable` and the weapon
  flag. `removecom()` has a genuine quirk, reproduced deliberately: no `return` after printing
  `"You are not wearing this"`, and no message at all on the path where removal actually happens.
- [`mud/support.c`](https://github.com/DavidKinder/AberMUD2/blob/master/mud/support.c) --
  `setoloc(ob, l, c)`, which sets an object's location *and* its carry-flag (0=in a room,
  1=carried, 2=worn) in one call. `getobj()`'s `setoloc(a,mynum,1)` and `dropitem()`'s
  `setoloc(a,curch,0)` both go through this; DROP's own `0` is what confirms dropping a worn
  object un-wears it as part of the same operation, not a separate step this adapter invented.

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
  score/strength/sex/level -- see `persistence/` below), `wielding` (character -> the object it
  currently wields, for WIELD), `worn` (every object currently worn, for WEAR/REMOVE), and
  AberMUD's own room/mobile/object definitions. Contains no command logic itself. Takes an
  `AberMUDAdapterOptions` with an optional `personaStore`; SAVE tells the player saving isn't
  available without one.
- `parser.ts`: `SessionInput -> Work[]`. The only place raw command text is read.
- `commands/`: one file per command (`look`, `exits`, `move`, `save`, `say`, `tell`, `who`, `get`,
  `drop`, `inventory`, `quit`, `wield`, `wear`, `remove`), each owning its `WorkKind` and handler.
  `objects.ts` is the one shared helper GET/DROP/WIELD/WEAR/REMOVE all need: find an
  `AberObjectDefinition` located at a given entity, by name -- "an object in the room" and "an
  object the actor is carrying" are the identical query, just with a different `at`. `quit.ts`
  sends a `QuitOutput` and does not touch the connection itself -- see the `login/` bullet below
  for what actually ends it. `drop.ts` and `quit.ts` both clear `worn` for whatever they move,
  since the source's own `setoloc()` does the same (see "Reference").
- `control.ts`: `Control` (`PrincipalId -> EntityId`) and `principalControlling`, the reverse
  lookup `say`/`tell`/`who` all need.
- `world/`: AberMUD's own room/mobile/object definitions -- not `WorldState`'s generic `Entity`.
  `AberRoomDefinition.number` preserves AberMUD's own historical room numbering (its archive
  stores room text under `TEXT/ROOMS/<number>`) alongside the `EntityId` used everywhere else in
  this engine. `AberObjectDefinition` has three independent flags now, matching three independent
  object bits in the source: `takeable` (GET/DROP), `wearable` (WEAR) and `weaponDamage`
  (WIELD, present only for a weapon). No carry-capacity limit is modeled yet.
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
  - `character/login.ts` -- character initialization for an already-authenticated `Session`: loads an existing persona or reproduces `initme()`'s new-character defaults (`score=0`, `strength=40`, `level=1`, sex supplied by the caller), then establishes `PrincipalId -> EntityId` control and adapter-owned live persona state. It deliberately does not implement the historical password/account authentication path.
  - `file-persona-store.ts` -- `AberMUDPersonaStore` (the narrow `save`/`load` contract SAVE, and
    eventually LOGIN, both need -- no `delete`, since no command needs one yet) and
    `FilePersonaStore`, a thin wrapper over one `UafRandFile`.

  - `login/abermud-login.ts` -- `runAberMUDLogin`: the Name/Password login *flow*, as distinct
    from `character/login.ts`'s character *initialization*. Prompts for a name, then a password
    with the connection's local echo suppressed for it (`AberMUDLoginConnection.setEcho`), calls
    `AberMUDAdapter.authenticate`, and on success opens a `Session` and switches the connection
    over to `Engine.receive`. A failed authentication reprompts for a name rather than closing the
    connection; a line arriving while `authenticate` (or the `login()` that follows it) is still
    pending is dropped, not queued -- `authenticate` is async, and nothing about a network
    connection guarantees a client waits for its own prompt before sending more. Deliberately out
    of scope: new-character creation (`login()` needs a `sex` only for a brand-new character, and
    this always passes `0`), a retry limit, and any wording beyond "Name:"/"Password:"/"Login
    incorrect.". `login/login-connection.ts` -- `AberMUDLoginConnection`: the minimal shape this
    needs from whatever carried a line to it (line-oriented input/output, plus `setEcho` and
    `close`), declared here rather than imported from a transport package, so this adapter has no
    dependency on any specific transport. `@stratamu/plugin-telnet`'s `TelnetConnection` already
    satisfies it structurally; its own tests prove that over a real socket (see that package's
    README), since this package has no socket of its own to prove it with. `runAberMUDLogin`'s own
    `Session.send` is also where QUIT actually takes effect: it watches every outgoing `AberOutput`
    for a `"quit"`, `"actor"` one and calls `connection.close()` right after writing it --
    `commands/quit.ts` itself never sees `AberMUDLoginConnection` at all, only `Session`.

  `test/uaf-rand-codec.test.ts` proves the codec alone, including against real bytes captured
  from actually compiling and running `mud/makeuaf.c` (see "Reference") -- not just a round trip
  through itself. `test/uaf-rand-file.test.ts` proves the slot semantics above.
  `test/file-persona-store.test.ts` only proves the thin wrapper delegates correctly, through a
  *fresh* instance -- a real round trip, the way a process restart would use it.

`personas` answers a question SAVE forced: generic `Entity`/`WorldState` deliberately carry no
notion of score/strength/sex/level, so where does a character's live status live while the game
is running? Here, adapter-owned, the same way `rooms`/`control` already are -- not by enlarging
`Entity`.

GET/DROP/INVENTORY forced `engine/world`'s containment question: an object picked up is `locate`d
at the character instead of the room, the identical operation a room-to-room move already was, and
needed no new relationship on `WorldState` -- see that package's README.

QUIT forced a different question: how does a game-level command end an actual network connection,
when neither `Session` nor the generic engine has, or should have, any notion of one? The answer
is that it doesn't -- `quit.ts` sends a `QuitOutput` through the ordinary `Session.send` channel,
same as every other command's output, and the composition that already owns the connection
(`runAberMUDLogin`) is what notices that one specific output and closes it. No new capability was
added to `Session`; `AberMUDLoginConnection` gained `close()`, since that composition already
needed the rest of that interface and now needs this one thing more.

WIELD/WEAR/REMOVE were built deliberately ahead of combat, not because equipment is interesting on
its own, but because the source's own damage and to-hit formulas (`hitplayer()`, `mud/blood.c`)
read the wielded weapon and worn armor directly -- combat would be unbuildable, or would have to
invent its own equipment concept mid-slice, without them existing first. Adapter-owned live state
(`wielding`, `worn`), the same category `personas` already is, not a `WorldState` fact: wielding
and wearing are about what a carried object *means*, not where anything is. `drop.ts` and
`quit.ts` both clear `worn` for what they move (see "Reference"'s `setoloc` note), matching the
source's own `setoloc()` exactly.

Deliberately minimal beyond that: no containers (`put X in Y`, `get X from Y`), no carry-capacity
limit, no combat itself, no RESET, no world-file persistence, and no interactive new-character
creation. Character initialization/load, account authentication, and the login *flow* that ties
them together and hands a connection off into ordinary game input
(`runAberMUDLogin`, see "What exists") are all implemented; what remains outside this adapter is
the transport itself -- sockets, Telnet or any other protocol -- which is
`@stratamu/plugin-telnet`'s concern, not this one's. Each further slice is meant to force whatever
the next real abstraction turns out to be, rather than be designed in ahead of that evidence.

## Public API

`AberMUDAdapter`, `AberMUDAdapterOptions`, `SessionInput`, `Control`, `AberRoomDefinition`,
`AberMobileDefinition`, `AberObjectDefinition`, `AberMUDPersona`, `AberMUDPersonaStore`,
`FilePersonaStore`, `runAberMUDLogin`, `AberMUDLoginOptions`, `AberMUDLoginConnection`,
`AberOutput` and its variants (including `TakenOutput`, `DroppedOutput`, `InventoryOutput`,
`QuitOutput`, `WieldedOutput`, `WornOutput`) and their `render*` functions -- how to compose and
use the adapter, what to implement or supply for
persistence, the login flow, and every shape a session can be sent. Work kinds, the parser,
`UafRandCodec`, and each command's handler are internal.
