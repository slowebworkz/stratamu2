import { Runtime } from "@stratamu/engine-core"
import { Sessions } from "@stratamu/engine-sessions"
import type { EngineState } from "@stratamu/engine-world"
import { WorldState } from "@stratamu/engine-world"
import { entity } from "@stratamu/entity"
import { entityId, principalId } from "@stratamu/primitives"

import { AberMUDAdapter } from "../../src/adapter.ts"

/**
 * A tiny test world, not AberMUD's own -- see the package README's "Non-goals". Just enough
 * topology to exercise look/exits/move/say/tell/who:
 *
 *   here --north--> there --south--> here
 *
 *   here:  Alice
 *   there: Bob, a goblin
 *
 * A sword exists (registered, not located) for a later slice that can place and pick it up.
 */
export function abermudFixture() {
  const world = new WorldState()
  const sessions = new Sessions()
  const engineState: EngineState = { world, sessions }
  const runtime = new Runtime({ engineState })
  const adapter = new AberMUDAdapter()
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

  const bobPlayer = entityId("bob-player")
  world.add(entity(bobPlayer, "abermud.player"))
  world.locate(bobPlayer, there)
  adapter.control.set(principalId("bob"), bobPlayer)
  adapter.charactersByName.set("bob", bobPlayer)

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
  adapter.objects.set(sword, { id: sword, name: "sword", description: "A plain iron sword." })

  return { world, sessions, runtime, adapter, here, there, alicePlayer, bobPlayer, goblin, sword }
}
