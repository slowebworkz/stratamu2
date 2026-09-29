import { ManualClock } from "@stratamu/clock"
import { Runtime } from "@stratamu/engine-core"
import { Sessions } from "@stratamu/engine-sessions"
import type { EngineState } from "@stratamu/engine-world"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import { Duration, Instant, entityId, principalId } from "@stratamu/primitives"

import { AberMUDAdapter, type AberMUDAdapterOptions } from "../../src/adapter.ts"

/** Domain marker for the combat clock's ticks. */
type CombatTick = { readonly kind: "combat-tick" }

/** The clock ID the fixture registers under when `withCombatClock: true` is passed. */
export const COMBAT_CLOCK = "abermud.combat" as const

/** A manual clock for driving the combat loop in tests. Advance with `combatClock.tick(n)`. */
export type CombatClock = ManualClock<CombatTick> & { tick(n: number): void }

/** Options for `abermudFixture` beyond the adapter's own options. */
export interface AbermudFixtureOptions extends AberMUDAdapterOptions {
  /** When true, creates a `ManualClock` for the combat loop and attaches it to the runtime.
   * The returned `combatClock` is undefined when this is false/absent. */
  readonly withCombatClock?: boolean
}

/**
 * A tiny test world, not AberMUD's own -- see the package README's "Non-goals". Just enough
 * topology to exercise look/exits/move/say/tell/who/save:
 *
 *   here --north--> there --south--> here
 *
 *   here:  Alice
 *   there: Bob, a goblin
 *
 * A sword (takeable, a weapon), a shield (takeable, wearable) and a statue (neither) exist,
 * registered but not located -- a GET/DROP/WIELD/WEAR test locates one where it needs it, the
 * same reason the original comment here gave for the sword alone: putting any in `here` by
 * default would change every other test's LOOK output too, since `RoomOutput` doesn't yet
 * distinguish an object from a character in "Also here" (LOOK describing objects at all is out
 * of this slice's scope -- see the package README).
 */
export function abermudFixture(options: AbermudFixtureOptions = {}) {
  const { withCombatClock, ...rest } = options
  let combatClock: CombatClock | undefined
  let adapterOptions: AberMUDAdapterOptions = rest
  if (withCombatClock) {
    const base = new ManualClock(Instant.from<CombatTick>(0n))
    combatClock = Object.assign(base, {
      tick: (n: number) => base.advance(Duration.from<CombatTick>(BigInt(n))),
    })
    adapterOptions = { ...rest, combatClockId: COMBAT_CLOCK }
  }
  const world = new WorldState()
  const sessions = new Sessions()
  const engineState: EngineState = { world, sessions }
  const runtime = new Runtime({ engineState })
  if (combatClock !== undefined) {
    runtime.attachClock(COMBAT_CLOCK, combatClock)
  }
  const adapter = new AberMUDAdapter(adapterOptions)
  adapter.registerHandlers(runtime)

  const here = entityId("here")
  const there = entityId("there")
  world.add(entity(here, "abermud.room"))
  world.add(entity(there, "abermud.room"))
  adapter.rooms.set(here, {
    id: here,
    number: 1,
    name: "Here",
    description: "A small starting room.",
    exits: new Map([["north", there]]),
  })
  adapter.rooms.set(there, {
    id: there,
    number: 2,
    name: "There",
    description: "A room further along.",
    exits: new Map([["south", here]]),
  })

  const alicePlayer = entityId("alice-player")
  world.add(entity(alicePlayer, "abermud.player"))
  world.locate(alicePlayer, here)
  adapter.control.set(principalId("alice"), alicePlayer)
  adapter.charactersByName.set("alice", alicePlayer)
  adapter.personas.set(alicePlayer, { name: "alice", score: 0, strength: 10, sex: 0, level: 1 })

  const bobPlayer = entityId("bob-player")
  world.add(entity(bobPlayer, "abermud.player"))
  world.locate(bobPlayer, there)
  adapter.control.set(principalId("bob"), bobPlayer)
  adapter.charactersByName.set("bob", bobPlayer)
  adapter.personas.set(bobPlayer, { name: "bob", score: 0, strength: 10, sex: 1, level: 1 })

  const goblin = entityId("goblin")
  world.add(entity(goblin, "abermud.mobile"))
  world.locate(goblin, there)
  adapter.mobiles.set(goblin, {
    id: goblin,
    name: "goblin",
    description: "A small, angry goblin.",
  })

  const sword = entityId("sword")
  world.add(entity(sword, "abermud.object"))
  adapter.objects.set(sword, {
    id: sword,
    name: "sword",
    description: "A plain iron sword.",
    takeable: true,
    wearable: false,
    weaponDamage: 8,
  })

  const shield = entityId("shield")
  world.add(entity(shield, "abermud.object"))
  adapter.objects.set(shield, {
    id: shield,
    name: "shield",
    description: "A round wooden shield.",
    takeable: true,
    wearable: true,
  })

  const statue = entityId("statue")
  world.add(entity(statue, "abermud.object"))
  adapter.objects.set(statue, {
    id: statue,
    name: "statue",
    description: "A heavy stone statue.",
    takeable: false,
    wearable: false,
  })

  return {
    world,
    sessions,
    runtime,
    adapter,
    here,
    there,
    alicePlayer,
    bobPlayer,
    goblin,
    sword,
    shield,
    statue,
    combatClock,
  }
}
