import { entity } from "@stratamu/entity"
import { entityId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import { WorldState } from "./world-state.ts"

const room = (id: string) => entity(entityId(id), "test.room")

describe("WorldState", () => {
  it("starts empty", () => {
    expect(new WorldState().size).toBe(0)
  })

  it("adds an entity and gets it back by id", () => {
    const world = new WorldState()
    const a = room("room-1")

    world.add(a)

    expect(world.get(entityId("room-1"))).toBe(a)
    expect(world.has(entityId("room-1"))).toBe(true)
    expect(world.size).toBe(1)
  })

  it("returns undefined and false for an id that does not exist", () => {
    const world = new WorldState()

    expect(world.get(entityId("nowhere"))).toBeUndefined()
    expect(world.has(entityId("nowhere"))).toBe(false)
  })

  it("refuses to add an entity whose id already exists", () => {
    const world = new WorldState()
    world.add(room("room-1"))

    expect(() => world.add(room("room-1"))).toThrow('Entity "room-1" already exists')
  })

  it("removes an entity, and reports whether it was there", () => {
    const world = new WorldState()
    world.add(room("room-1"))

    expect(world.remove(entityId("room-1"))).toBe(true)
    expect(world.remove(entityId("room-1"))).toBe(false)
    expect(world.size).toBe(0)
  })

  it("lists every entity, in no particular order", () => {
    const world = new WorldState()
    const a = room("room-1")
    const b = room("room-2")
    world.add(a)
    world.add(b)

    expect([...world.entities()].sort((x, y) => x.id.localeCompare(y.id))).toEqual([a, b])
  })

  it("has no location for an entity until one is recorded", () => {
    const world = new WorldState()
    world.add(entity(entityId("player-1"), "test.player"))

    expect(world.locationOf(entityId("player-1"))).toBeUndefined()
  })

  it("records and reports where an entity is, overwriting on a later move", () => {
    const world = new WorldState()
    world.add(entity(entityId("player-1"), "test.player"))
    world.add(room("room-1"))
    world.add(room("room-2"))

    world.locate(entityId("player-1"), entityId("room-1"))
    expect(world.locationOf(entityId("player-1"))).toBe(entityId("room-1"))

    world.locate(entityId("player-1"), entityId("room-2"))
    expect(world.locationOf(entityId("player-1"))).toBe(entityId("room-2"))
  })

  it("refuses to locate an entity that does not exist, or move it to one that does not", () => {
    const world = new WorldState()
    world.add(entity(entityId("player-1"), "test.player"))
    world.add(room("room-1"))

    expect(() => world.locate(entityId("nobody"), entityId("room-1"))).toThrow(
      'Entity "nobody" does not exist',
    )
    expect(() => world.locate(entityId("player-1"), entityId("nowhere"))).toThrow(
      'Entity "nowhere" does not exist',
    )
  })

  it("forgets an entity's location when the entity itself is removed", () => {
    const world = new WorldState()
    world.add(entity(entityId("player-1"), "test.player"))
    world.add(room("room-1"))
    world.locate(entityId("player-1"), entityId("room-1"))

    world.remove(entityId("player-1"))
    world.add(entity(entityId("player-1"), "test.player"))

    expect(world.locationOf(entityId("player-1"))).toBeUndefined()
  })

  it("has no occupants for a room nobody is in", () => {
    const world = new WorldState()
    world.add(room("room-1"))

    expect([...world.occupants(entityId("room-1"))]).toEqual([])
  })

  it("lists the id of every entity currently at a location, in no particular order", () => {
    const world = new WorldState()
    world.add(room("room-1"))
    const alice = entity(entityId("alice-player"), "test.player")
    const bob = entity(entityId("bob-player"), "test.player")
    world.add(alice)
    world.add(bob)
    world.locate(alice.id, entityId("room-1"))
    world.locate(bob.id, entityId("room-1"))

    expect([...world.occupants(entityId("room-1"))].sort()).toEqual([alice.id, bob.id].sort())
  })

  it("stops listing an entity once it has moved elsewhere", () => {
    const world = new WorldState()
    world.add(room("room-1"))
    world.add(room("room-2"))
    const alice = entity(entityId("alice-player"), "test.player")
    world.add(alice)
    world.locate(alice.id, entityId("room-1"))

    world.locate(alice.id, entityId("room-2"))

    expect([...world.occupants(entityId("room-1"))]).toEqual([])
    expect([...world.occupants(entityId("room-2"))]).toEqual([alice.id])
  })
})
