import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"

/** A deterministic stand-in for `Math.random`, returning each of `values` in turn (cycling once
 * exhausted). `kill.ts` calls its `rng` once for the to-hit roll and, only on a hit, once more
 * for the damage roll -- `sequence([toHit, damage])` controls both independently. */
function sequence(values: readonly number[]): () => number {
  let n = 0
  return () => {
    const value = values[n % values.length] ?? 0
    n += 1
    return value
  }
}

describe("KILL", () => {
  it("hits, damages the victim, and rewards the attacker's score", async () => {
    // cth = 40 + 3*1 = 43; roll 0 hits. Bare hands: damage = floor(0.5*4) = 2.
    const { runtime, world, sessions, adapter, here, alicePlayer, bobPlayer } = abermudFixture({
      rng: sequence([0, 0.5]),
    })
    world.locate(bobPlayer, here)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([
      { kind: "combat", perspective: "attacker", outcome: "hit", attacker: "alice", victim: "bob" },
    ])
    expect(adapter.personas.get(bobPlayer)?.strength).toBe(8)
    expect(adapter.personas.get(alicePlayer)?.score).toBe(4)
  })

  it("tells the victim they were hit, weapon named when one is wielded", async () => {
    const { runtime, world, sessions, adapter, here, alicePlayer, bobPlayer, sword } =
      abermudFixture({ rng: sequence([0, 0.5]) })
    world.locate(bobPlayer, here)
    world.locate(sword, alicePlayer)
    adapter.wielding.set(alicePlayer, sword)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(bob.output).toEqual([
      {
        kind: "combat",
        perspective: "victim",
        outcome: "hit",
        attacker: "alice",
        victim: "bob",
        weapon: "sword",
      },
    ])
  })

  it("misses when the roll beats the chance to hit, and damages no one", async () => {
    // cth = 43; roll 99 misses.
    const { runtime, world, sessions, adapter, here, bobPlayer } = abermudFixture({
      rng: sequence([0.99]),
    })
    world.locate(bobPlayer, here)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([
      {
        kind: "combat",
        perspective: "attacker",
        outcome: "miss",
        attacker: "alice",
        victim: "bob",
      },
    ])
    expect(bob.output).toEqual([
      { kind: "combat", perspective: "victim", outcome: "miss", attacker: "alice", victim: "bob" },
    ])
    expect(adapter.personas.get(bobPlayer)?.strength).toBe(10)
  })

  it("a worn item reduces the victim's chance to be missed by giving them -10 to defend", async () => {
    // cth = 43 - 10 = 33; roll 40 would hit an unarmored target but misses this one.
    const { runtime, world, sessions, adapter, here, bobPlayer, shield } = abermudFixture({
      rng: sequence([0.4]),
    })
    world.locate(bobPlayer, here)
    world.locate(shield, bobPlayer)
    adapter.worn.add(shield)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([
      {
        kind: "combat",
        perspective: "attacker",
        outcome: "miss",
        attacker: "alice",
        victim: "bob",
      },
    ])
  })

  it("a lethal hit kills the victim: dumps their items, removes them from the world, and deletes their persona", async () => {
    const { runtime, world, sessions, adapter, here, alicePlayer, bobPlayer, sword } =
      abermudFixture({ rng: sequence([0, 0.99]) })
    world.locate(bobPlayer, here)
    world.locate(sword, bobPlayer)
    adapter.worn.add(sword)
    adapter.wielding.set(bobPlayer, sword)
    adapter.personas.set(bobPlayer, { name: "bob", score: 0, strength: 1, sex: 1, level: 1 })
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([
      { kind: "combat", perspective: "attacker", outcome: "hit", attacker: "alice", victim: "bob" },
      { kind: "killed", perspective: "attacker", attacker: "alice", victim: "bob" },
    ])
    expect(bob.output).toEqual([
      {
        kind: "combat",
        perspective: "victim",
        outcome: "hit",
        attacker: "alice",
        victim: "bob",
      },
      { kind: "killed", perspective: "victim", attacker: "alice", victim: "bob" },
    ])
    expect(world.locationOf(sword)).toBe(here)
    expect(adapter.worn.has(sword)).toBe(false)
    expect(adapter.wielding.has(bobPlayer)).toBe(false)
    expect(world.has(bobPlayer)).toBe(false)
    // Attacker's score gets both the per-hit bonus and the lethal-level bonus.
    expect(adapter.personas.get(alicePlayer)?.score).toBeGreaterThan(0)
  })

  it("asks who, given no target", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "kill" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "kill-who" }])
  })

  it("refuses to let the actor kill themselves", async () => {
    const { runtime, sessions, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")
    sessions.open(session)

    for (const item of adapter.parse({ session, raw: "kill alice" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "cant-kill-self" }])
  })

  it("refuses an unknown or currently disconnected name", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-1", "alice")

    for (const item of adapter.parse({ session, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "cant-find-them" }])
  })

  it("refuses a known, connected target who isn't in the same room", async () => {
    const { runtime, sessions, adapter } = abermudFixture()
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([{ kind: "refusal", reason: "not-here-to-fight" }])
  })

  it("falls back to bare hands, and clears the stale entry, when the wielded weapon is no longer carried", async () => {
    const { runtime, world, sessions, adapter, here, alicePlayer, bobPlayer, sword } =
      abermudFixture({ rng: sequence([0, 0]) })
    world.locate(bobPlayer, here)
    // sword exists but alice isn't carrying it -- wielding is stale.
    adapter.wielding.set(alicePlayer, sword)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([
      { kind: "combat", perspective: "attacker", outcome: "hit", attacker: "alice", victim: "bob" },
    ])
    expect(adapter.wielding.has(alicePlayer)).toBe(false)
  })

  it("has no output for a session controlling nothing", async () => {
    const { runtime, adapter } = abermudFixture()
    const session = testSession("session-3")

    for (const item of adapter.parse({ session, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(session.output).toEqual([{ kind: "refusal", reason: "not-controlling" }])
  })
})
