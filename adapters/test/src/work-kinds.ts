import { workKind } from "@stratamu/work"

/**
 * This adapter's own namespace. Five probes (session boundary, player control, world movement,
 * world messaging, session lifecycle) each invented a local `test.look`/`test.move`/`test.say`
 * `WorkKind` to have *something* to route through the engine -- proof filler, not a real game.
 * These are that filler's actual owner now: `engine/core` still treats every `WorkKind` as an
 * opaque string, and never imports this file. Only an adapter -- this one, and eventually
 * `mush.*`, `moo.*`, `diku.*` -- gives a namespace like `test.*` meaning.
 */
export const look = workKind("test.look")
export const move = workKind("test.move")
export const say = workKind("test.say")
