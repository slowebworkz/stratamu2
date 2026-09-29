import { describe, expect, it } from "vitest"

import { testSession } from "./fixtures/session.ts"
import { abermudFixture } from "./fixtures/world.ts"
import type { CombatClock } from "./fixtures/world.ts"

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

  it("refuses when the target has no persona, even if they are controlled and present", async () => {
    const { runtime, world, sessions, adapter, here, bobPlayer } = abermudFixture()
    world.locate(bobPlayer, here)
    adapter.personas.delete(bobPlayer)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([{ kind: "refusal", reason: "cant-find-them" }])
  })

  it("calls store.delete with the victim's name on a lethal hit", async () => {
    const deleted: string[] = []
    const personaStore = {
      save: async () => {},
      load: async (): Promise<undefined> => undefined,
      delete: async (name: string) => {
        deleted.push(name)
      },
    }
    // rng=[0, 0.99]: to-hit roll 0 hits (cth 43 > 0); damage = floor(0.99*4)=3; strength 1-3=-2 → lethal
    const { runtime, world, sessions, adapter, here, bobPlayer } = abermudFixture({
      rng: sequence([0, 0.99]),
      personaStore,
    })
    world.locate(bobPlayer, here)
    adapter.personas.set(bobPlayer, { name: "bob", score: 0, strength: 1, sex: 1, level: 1 })
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(deleted).toEqual(["bob"])
  })

  it("a hit that reduces strength to exactly zero does not kill", async () => {
    // rng=[0, 0.5]: to-hit roll 0 hits (cth 43 > 0); damage = floor(0.5*4)=2; strength 2-2=0 → alive (≥0)
    const { runtime, world, sessions, adapter, here, bobPlayer } = abermudFixture({
      rng: sequence([0, 0.5]),
    })
    world.locate(bobPlayer, here)
    adapter.personas.set(bobPlayer, { name: "bob", score: 0, strength: 2, sex: 1, level: 1 })
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(adapter.personas.get(bobPlayer)?.strength).toBe(0)
    expect(world.has(bobPlayer)).toBe(true)
  })

  it("a roll exactly at the chance-to-hit threshold misses", async () => {
    // level 1: cth = 40 + 3*1 = 43; hit if cth > floor(rng*100).
    // floor(0.43*100)=43 → 43>43 is false → miss.
    const { runtime, world, sessions, adapter, here, bobPlayer } = abermudFixture({
      rng: sequence([0.43]),
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
    expect(adapter.personas.get(bobPlayer)?.strength).toBe(10)
  })

  it("the attacker receives the level-squared kill bonus on top of the per-hit damage bonus", async () => {
    // level 2 victim: kill bonus = 2^2*100 = 400; damage = floor(0.99*4)=3; damage bonus = 3*2=6; total = 406
    const { runtime, world, sessions, adapter, here, alicePlayer, bobPlayer } = abermudFixture({
      rng: sequence([0, 0.99]),
    })
    world.locate(bobPlayer, here)
    adapter.personas.set(bobPlayer, { name: "bob", score: 0, strength: 1, sex: 1, level: 2 })
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(adapter.personas.get(alicePlayer)?.score).toBe(406)
  })

  it("falls back to bare hands, and clears the stale entry, when the wielded weapon has no definition", async () => {
    // sword is carried by alice but not registered in objects -- definition lookup returns undefined.
    const { runtime, world, sessions, adapter, here, alicePlayer, bobPlayer, sword } =
      abermudFixture({ rng: sequence([0, 0]) })
    world.locate(bobPlayer, here)
    world.locate(sword, alicePlayer)
    adapter.wielding.set(alicePlayer, sword)
    adapter.objects.delete(sword)
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

  it("clears combat and allows a new KILL when the target leaves the room before the next round", async () => {
    // Round 1: non-lethal hit → alice is in_fight, next round scheduled.
    // Bob moves to another room before the tick fires.
    // The combat-round handler sees target no longer co-located → clears inFight, no attack.
    // Alice can then issue a fresh KILL (location refusal, not "already-fighting").
    const { runtime, world, sessions, adapter, here, there, alicePlayer, bobPlayer, combatClock } =
      abermudFixture({ rng: sequence([0, 0.5]), withCombatClock: true })
    world.locate(bobPlayer, here)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()
    expect(adapter.inFight.get(alicePlayer)).toBe(bobPlayer)

    // Bob moves away before the combat tick.
    world.locate(bobPlayer, there)
    ;(combatClock as CombatClock).tick(1)
    await runtime.drain()

    expect(adapter.inFight.size).toBe(0)

    // Confirm alice is no longer locked: a new KILL gives the location refusal, not "already-fighting".
    alice.output.length = 0
    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([{ kind: "refusal", reason: "not-here-to-fight" }])
  })

  it("clears combat when the attacker's entity is removed before the next round fires", async () => {
    // Simulates disconnect/death: world.remove() removes the actor.
    // The combat-round handler sees locationOf(actor) === undefined → clears inFight, no attack.
    const { runtime, world, sessions, adapter, here, alicePlayer, bobPlayer, combatClock } =
      abermudFixture({ rng: sequence([0, 0.5]), withCombatClock: true })
    world.locate(bobPlayer, here)
    const alice = testSession("session-1", "alice")
    const bob = testSession("session-2", "bob")
    sessions.open(alice)
    sessions.open(bob)

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()
    expect(adapter.inFight.get(alicePlayer)).toBe(bobPlayer)

    const strengthBeforeTick = adapter.personas.get(bobPlayer)?.strength

    // Actor's entity is removed (disconnect / death in another context).
    world.remove(alicePlayer)
    ;(combatClock as CombatClock).tick(1)
    await runtime.drain()

    // inFight cleared; bob untouched (no second attack fired).
    expect(adapter.inFight.size).toBe(0)
    expect(adapter.personas.get(bobPlayer)?.strength).toBe(strengthBeforeTick)
  })

  it("does not lock the actor when no combat clock is configured", async () => {
    // Without a combat clock, KILL is single-round: inFight must not be set, so a second
    // player-initiated KILL must succeed rather than returning "already-fighting".
    const { runtime, world, sessions, adapter, here, bobPlayer } = abermudFixture({
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
    alice.output.length = 0
    bob.output.length = 0

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    // Second KILL resolves normally -- no "already-fighting" lockout.
    expect(alice.output).toEqual([
      { kind: "combat", perspective: "attacker", outcome: "hit", attacker: "alice", victim: "bob" },
    ])
    expect(adapter.inFight.size).toBe(0)
  })

  it("refuses a second KILL command while already in combat", async () => {
    // rng=[0, 0.5]: first KILL hits, bob survives (strength 10-2=8). alice is now in_fight.
    // alice immediately submits KILL bob again before a combat tick fires -- should be refused.
    const { runtime, world, sessions, adapter, here, bobPlayer } = abermudFixture({
      rng: sequence([0, 0.5]),
      withCombatClock: true,
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

    // First round resolved -- alice is now in_fight.
    alice.output.length = 0
    bob.output.length = 0

    for (const item of adapter.parse({ session: alice, raw: "kill bob" })) {
      runtime.submit({ work: item })
    }
    await runtime.drain()

    expect(alice.output).toEqual([{ kind: "refusal", reason: "already-fighting" }])
  })

  it("automatically attacks again after one combat tick when the target survives", async () => {
    // Round 1: rng=[0, 0.5] → hit, damage 2. Round 2: rng cycles → same sequence → hit again.
    // Bob starts at strength 10; after round 1: 8; after round 2: 6.
    const { runtime, world, sessions, adapter, here, bobPlayer, combatClock } = abermudFixture({
      rng: sequence([0, 0.5]),
      withCombatClock: true,
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

    expect(adapter.personas.get(bobPlayer)?.strength).toBe(8)
    const roundOneOutput = alice.output.length

    // Advance the combat clock by 1 tick to trigger the next round.
    ;(combatClock as CombatClock).tick(1)
    await runtime.drain()

    expect(adapter.personas.get(bobPlayer)?.strength).toBe(6)
    // alice got a second combat output for the second round
    expect(alice.output.length).toBe(roundOneOutput + 1)
    expect(alice.output[roundOneOutput]).toEqual({
      kind: "combat",
      perspective: "attacker",
      outcome: "hit",
      attacker: "alice",
      victim: "bob",
    })
  })
})
