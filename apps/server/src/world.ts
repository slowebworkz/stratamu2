import type { AberMUDAdapter } from "@stratamu/adapter-abermud"
import type { WorldState } from "@stratamu/engine-world"
import { type EntityId, entityId } from "@stratamu/primitives"

/**
 * A small handcrafted world for the vertical slice. Four rooms, two objects. Enough topology to
 * exercise LOOK, EXITS, MOVE, GET, DROP, WIELD, WEAR, REMOVE, INVENTORY, SAY, WHO, SAVE, QUIT.
 *
 * Layout:
 *
 *   [ Market ] <--west-- [ Town Square ] --north--> [ North Gate ]
 *                                                        |
 *                                                      south
 *                                                        |
 *                                                   [ Tavern Road ]
 *
 * The rusty sword spawns in Town Square; the leather cap spawns in the Market.
 */
export function populateWorld(world: WorldState, adapter: AberMUDAdapter): EntityId {
  const square = entityId("abermud.room:town-square")
  const market = entityId("abermud.room:market")
  const gate = entityId("abermud.room:north-gate")
  const road = entityId("abermud.room:tavern-road")

  for (const id of [square, market, gate, road]) {
    world.add(Object.freeze({ id, type: "abermud.room" }))
  }

  adapter.rooms.set(square, {
    id: square,
    number: 1,
    name: "Town Square",
    description: "A cobblestone square at the heart of a small town. A rusty sword lies here.",
    exits: new Map([
      ["north", gate],
      ["east", market],
    ]),
  })

  adapter.rooms.set(market, {
    id: market,
    number: 2,
    name: "The Market",
    description: "Stalls line the walls. A leather cap sits on a hook.",
    exits: new Map([["west", square]]),
  })

  adapter.rooms.set(gate, {
    id: gate,
    number: 3,
    name: "North Gate",
    description: "A heavy iron gate marks the edge of town.",
    exits: new Map([
      ["south", square],
      ["north", road],
    ]),
  })

  adapter.rooms.set(road, {
    id: road,
    number: 4,
    name: "Tavern Road",
    description: "A dirt road leads to the distant lights of a tavern.",
    exits: new Map([["south", gate]]),
  })

  // Objects
  const sword = entityId("abermud.object:rusty-sword")
  world.add(Object.freeze({ id: sword, type: "abermud.object" }))
  world.locate(sword, square)
  adapter.objects.set(sword, {
    id: sword,
    name: "rusty sword",
    description: "A battered iron sword with a worn leather grip.",
    takeable: true,
    wearable: false,
    weaponDamage: 5,
  })

  const cap = entityId("abermud.object:leather-cap")
  world.add(Object.freeze({ id: cap, type: "abermud.object" }))
  world.locate(cap, market)
  adapter.objects.set(cap, {
    id: cap,
    name: "leather cap",
    description: "A simple cap of hardened leather.",
    takeable: true,
    wearable: true,
  })

  return square
}
