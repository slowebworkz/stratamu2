import { Runtime } from "@stratamu/engine-core"
import { Sessions } from "@stratamu/engine-sessions"
import type { EngineState } from "@stratamu/engine-world"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import { entityId, principalId } from "@stratamu/primitives"

import { AberMUDAdapter, type AberMUDAdapterOptions } from "../../src/adapter.ts"

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
export function abermudFixture(options: AberMUDAdapterOptions = {}) {
  const world = new WorldState()
  const sessions = new Sessions()
  const engineState: EngineState = { world, sessions }
  const runtime = new Runtime({ engineState })
  const adapter = new AberMUDAdapter(options)
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
  }
}
