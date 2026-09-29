import type { ClockId, Runtime, TaskContext } from "@stratamu/engine-core"
import { schedule } from "@stratamu/engine-core"
import type { Session } from "@stratamu/engine-sessions"
import type { WorldState } from "@stratamu/engine-world"
import type { EntityId, PrincipalId } from "@stratamu/primitives"
import { work, workKind } from "@stratamu/work"

import type { Control } from "../control.ts"
import { principalControlling } from "../control.ts"
import { type CombatOutput, type KilledOutput, refusal } from "../output.ts"
import type { AberMUDPersona, AberMUDPersonaStore } from "../persistence/index.ts"
import type { AberObjectDefinition } from "../world/index.ts"
import { type ActiveCharacter, resolveActiveCharacter } from "./characters.ts"
import { resolveActor } from "./look.ts"

/** A source of numbers in `[0, 1)`. `Math.random` at the composition root by default; injectable
 * so a test can make a roll deterministic, and so this isn't quietly load-bearing on a global
 * nothing else in this package touches. The recovered source's own `randperc()` fills the same
 * two roles here: the to-hit roll and the damage roll. A proper engine-level RNG primitive
 * (`Clock<T>`'s sibling, for the same determinism-boundary reasons) is the next architectural
 * probe once more than this one command needs one -- not designed in ahead of that evidence. */
export type Rng = () => number

/** KILL's target is exactly an `ActiveCharacter` -- found by name, currently controlled, and
 * actively playing, the identical resolution TELL needs. Matches the source's own `fpbn()`
 * (`mud/blood.c`), which only ever scans live, connected characters in the first place. */
type CombatTarget = ActiveCharacter

/** What `hitplayer()` resolves before rolling anything: the wielded object's definition, if it
 * still has one, and the damage a hit actually does -- bare hands' fixed `4` either way. */
interface CombatWeapon {
  readonly definition: AberObjectDefinition | undefined
  readonly damage: number
}

const BARE_HANDS: CombatWeapon = { definition: undefined, damage: 4 }

/**
 * Re-validated at hit time, not just trusted from `wielding`: the source's own `hitplayer()`
 * does the identical re-check (`!iscarrby(wpn,mynum)`) and falls back to bare hands rather than
 * assuming `wielding` can't be stale. `worn`/`wielding`'s own invariants make this defensive
 * rather than load-bearing here, but the source checks it unconditionally, so this does too --
 * clearing the stale entry either way it fails, the same reason DROP/QUIT already do.
 */
function resolveWeapon(
  actor: EntityId,
  world: WorldState | undefined,
  objects: ReadonlyMap<EntityId, AberObjectDefinition>,
  wielding: Map<EntityId, EntityId>,
): CombatWeapon {
  const wieldedId = wielding.get(actor)
  if (wieldedId === undefined) {
    return BARE_HANDS
  }
  if (world?.locationOf(wieldedId) !== actor) {
    wielding.delete(actor)
    return BARE_HANDS
  }
  const definition = objects.get(wieldedId)
  if (definition === undefined) {
    wielding.delete(actor)
    return BARE_HANDS
  }
  return { definition, damage: definition.weaponDamage ?? 4 }
}

/** Whether `entity` currently has anything in `worn` -- `iswornby()`'s own generalized form (see
 * `registerKill`'s own note on why the source's three specific object ids became "anything"). */
function hasWornItem(
  entity: EntityId,
  world: WorldState | undefined,
  worn: ReadonlySet<EntityId>,
): boolean {
  for (const id of worn) {
    if (world?.locationOf(id) === entity) {
      return true
    }
  }
  return false
}

/** `40 + 3*level`, minus 10 if the victim has anything worn, clamped at 0; hit if that beats a
 * `[0, 100)` roll. */
function rollAttack(level: number, victimHasWornItem: boolean, rng: Rng): boolean {
  let chanceToHit = 40 + 3 * level
  if (victimHasWornItem) {
    chanceToHit -= 10
  }
  chanceToHit = Math.max(chanceToHit, 0)
  return chanceToHit > Math.floor(rng() * 100)
}

/** Uniform in `[0, weaponDamage)` -- `randperc()%dambyitem(wpn)` in the source. */
function rollDamage(weaponDamage: number, rng: Rng): number {
  return Math.floor(rng() * weaponDamage)
}

/** Sends one `CombatOutput` to each side of an attack, `perspective` the only field that
 * differs -- the duplication `hitplayer()`'s own direct-write/`sendsys` split forces on every
 * hit and every miss, not incidental repetition. */
function sendCombatResult(
  attacker: Session | undefined,
  victim: Session,
  output: Omit<CombatOutput, "perspective">,
): void {
  attacker?.send({ ...output, perspective: "attacker" } satisfies CombatOutput)
  victim.send({ ...output, perspective: "victim" } satisfies CombatOutput)
}

/**
 * Everything `bloodrcv()`'s lethal branch does once a hit is fatal: the score bonus, both sides'
 * `KilledOutput`, `dumpitems()`'s carried-item relocation (and the matching `worn`/`wielding`
 * cleanup DROP/QUIT already established), and `closeworld()`/`delpers()` -- removal from the
 * world and permadeath. A separate domain operation from resolving and rolling the hit itself,
 * the same reason `resolveWeapon` is its own function.
 */
async function handleDeath(
  actor: EntityId,
  attackerSession: Session | undefined,
  attackerName: PrincipalId | EntityId,
  target: CombatTarget,
  victimPersona: AberMUDPersona,
  location: EntityId,
  context: TaskContext,
  personas: Map<EntityId, AberMUDPersona>,
  worn: Set<EntityId>,
  wielding: Map<EntityId, EntityId>,
  store: AberMUDPersonaStore | undefined,
): Promise<void> {
  // Bonus score, matching `hitplayer()`'s `victim<16` (player-target) branch exactly.
  const currentAttackerPersona = personas.get(actor)
  if (currentAttackerPersona !== undefined) {
    personas.set(actor, {
      ...currentAttackerPersona,
      score: currentAttackerPersona.score + victimPersona.level * victimPersona.level * 100,
    })
  }

  const victimName = target.principal
  attackerSession?.send({
    kind: "killed",
    perspective: "attacker",
    attacker: attackerName,
    victim: victimName,
  } satisfies KilledOutput)
  target.session.send({
    kind: "killed",
    perspective: "victim",
    attacker: attackerName,
    victim: victimName,
  } satisfies KilledOutput)

  // dumpitems(): every carried object relocated to the room, the same as QUIT, and the same
  // worn/wielding cleanup -- a corpse can't stay wearing or wielding anything either.
  const carried = [...(context.world?.occupants(target.entity) ?? [])]
  for (const id of carried) {
    context.world?.locate(id, location)
    worn.delete(id)
    if (wielding.get(target.entity) === id) {
      wielding.delete(target.entity)
    }
  }

  // closeworld() + delpers(): unlike QUIT, which deliberately leaves the character's own
  // location alone, death actually removes them from the world -- and deletes their save,
  // permadeath, not a data-loss bug (see `AberMUDPersonaStore`'s own note).
  context.world?.remove(target.entity)
  if (store !== undefined) {
    await store.delete(victimPersona.name)
  }
}

/**
 * Resolves a target by entity id back to an `ActiveCharacter` -- the combat-round equivalent of
 * `resolveActiveCharacter`, used when we already have the entity rather than a name. Returns
 * `undefined` for any of: the entity is no longer controlled, its principal has no active session.
 */
function resolveTargetByEntity(
  entity: EntityId,
  control: Control,
  sessions: Parameters<typeof resolveActiveCharacter>[3],
): ActiveCharacter | undefined {
  const principal = principalControlling(control, entity)
  if (principal === undefined) return undefined
  const session = sessions?.activeFor(principal)
  if (session === undefined) return undefined
  return { entity, principal, session }
}

/**
 * One full attack round: weapon resolution, to-hit roll, damage roll, output, state mutations,
 * death handling. Called by the initial KILL handler and by the scheduled `combatRound` handler
 * — `hitplayer()` in `mud/blood.c`, reused the same way the source reuses it.
 *
 * Schedules the next round via `clockId` when the target survives. Clears `inFight` on kill;
 * sets it (and schedules the follow-up) on miss/non-lethal hit.
 */
async function executeAttack(
  actor: EntityId,
  attackerSession: Session | undefined,
  attackerName: PrincipalId | EntityId,
  target: CombatTarget,
  location: EntityId,
  context: TaskContext,
  runtime: Runtime,
  objects: ReadonlyMap<EntityId, AberObjectDefinition>,
  personas: Map<EntityId, AberMUDPersona>,
  wielding: Map<EntityId, EntityId>,
  worn: Set<EntityId>,
  store: AberMUDPersonaStore | undefined,
  inFight: Map<EntityId, EntityId>,
  clockId: ClockId | undefined,
  rng: Rng,
): Promise<void> {
  const attackerPersona = personas.get(actor)
  const victimPersona = personas.get(target.entity)
  if (attackerPersona === undefined || victimPersona === undefined) {
    attackerSession?.send(refusal("cant-find-them"))
    inFight.delete(actor)
    return
  }

  const weapon = resolveWeapon(actor, context.world, objects, wielding)
  const hit = rollAttack(
    attackerPersona.level,
    hasWornItem(target.entity, context.world, worn),
    rng,
  )

  const victimName = target.principal

  if (!hit) {
    sendCombatResult(attackerSession, target.session, {
      kind: "combat",
      outcome: "miss",
      attacker: attackerName,
      victim: victimName,
      weapon: weapon.definition?.name,
    })
    scheduleNextRound(actor, target.entity, runtime, inFight, clockId)
    return
  }

  const damage = rollDamage(weapon.damage, rng)
  sendCombatResult(attackerSession, target.session, {
    kind: "combat",
    outcome: "hit",
    attacker: attackerName,
    victim: victimName,
    weapon: weapon.definition?.name,
  })

  const remainingStrength = victimPersona.strength - damage
  personas.set(target.entity, { ...victimPersona, strength: remainingStrength })
  personas.set(actor, { ...attackerPersona, score: attackerPersona.score + damage * 2 })

  if (remainingStrength >= 0) {
    scheduleNextRound(actor, target.entity, runtime, inFight, clockId)
    return
  }

  inFight.delete(actor)
  await handleDeath(
    actor,
    attackerSession,
    attackerName,
    target,
    victimPersona,
    location,
    context,
    personas,
    worn,
    wielding,
    store,
  )
}

/** Marks the actor as fighting `targetEntity` and schedules the next combat round if a clock is
 * available. Matches `hitplayer()`'s `fighting=victim; in_fight=300;` at the end of each round. */
function scheduleNextRound(
  actor: EntityId,
  targetEntity: EntityId,
  runtime: Runtime,
  inFight: Map<EntityId, EntityId>,
  clockId: ClockId | undefined,
): void {
  inFight.set(actor, targetEntity)
  if (clockId !== undefined) {
    runtime.submit({ work: work(combatRound, { actor, target: targetEntity }) }, schedule.after(1, clockId))
  }
}

/**
 * KILL: attacks another character. Verified against `killcom()`/`hitplayer()`/`bloodrcv()` in
 * `mud/blood.c`. The source's own synonyms are "shoot"/"hit"/"fire"/"launch"/"smash"/"break" (all
 * the same verb number in `mud/parse.c`'s `verbtxt`/`verbnum`) -- note there is no "attack" in the
 * real vocabulary at all; only "kill" is implemented here, the rest deliberately deferred rather
 * than guessed at.
 *
 * Health is not new state: it *is* `AberMUDPersona.strength`, matching the source exactly --
 * `pstr`/`setpstr` read and write the same `ublock` field this adapter's `strength` already
 * represents. No parallel `health` map was needed for this to work.
 *
 * To-hit: `40 + 3*level`, minus 10 if the victim has anything worn. The source's own formula
 * gates that penalty on three specific object ids (89/113/114, `iswornby()`) rather than "worn"
 * in general; generalized here the same way `takeable`/`wearable` already generalize specific
 * source bits into adapter-wide concepts, since this world's fixture objects don't carry the
 * source's real item numbers to match against.
 *
 * Damage: a weapon's own `weaponDamage` (bare hands: a fixed `4`, `dambyitem`'s `wpn==-1` case),
 * rolled uniformly in `[0, weaponDamage)` -- `randperc()%dambyitem(wpn)` in the source.
 *
 * Not modeled from `killcom()`: `kill <object>` (routes to `breakitem()`, unrelated to combat),
 * and `kill X with Y` (a specific-weapon override of what's wielded) -- both deliberately deferred,
 * since this slice's job is the smallest single attack, not the full command grammar.
 *
 * `in_fight` guard: `hitplayer()` checks `if(in_fight)` and returns "You are already fighting!"
 * when the actor is mid-combat. Modeled here via `inFight.has(actor)`. The repeated combat rounds
 * are driven by a clock (`clockId`); if no clock is registered the loop is one-and-done.
 *
 * Not yet modeled: monster targets (`victim<16`'s other branch, `woundmn()`) -- a completely
 * separate subsystem this slice doesn't touch. Bilateral combat (victim auto-counterattacking) is
 * also not yet modeled: `bloodrcv()` sets the victim's own `in_fight`/`fighting`, but the engine
 * architecture for non-player-initiated periodic actions is still open.
 *
 * No room broadcast: the source itself has none here either, unlike GET/DROP/WIELD -- `hitplayer()`
 * only ever writes to the attacker directly and `sendsys`s the victim, nothing broader.
 */
export const kill = workKind("abermud.kill")

/** A scheduled follow-up attack, driven by the combat clock. Carries the actor/target entity pair
 * established when the previous round landed -- the same role `fighting` plays in the source. */
export const combatRound = workKind("abermud.combat-round")

export function registerKill(
  runtime: Runtime,
  control: Control,
  charactersByName: ReadonlyMap<string, EntityId>,
  objects: ReadonlyMap<EntityId, AberObjectDefinition>,
  personas: Map<EntityId, AberMUDPersona>,
  wielding: Map<EntityId, EntityId>,
  worn: Set<EntityId>,
  store: AberMUDPersonaStore | undefined,
  rng: Rng = Math.random,
  inFight: Map<EntityId, EntityId> = new Map(),
  clockId?: ClockId,
): void {
  runtime.handle(kill, async (task, context) => {
    const { session, name } = task.work.input as { session: Session | undefined; name: string }
    const actor = resolveActor(control, session)
    if (actor === undefined) {
      session?.send(refusal("not-controlling"))
      return
    }
    if (name.trim().length === 0) {
      session?.send(refusal("kill-who"))
      return
    }

    // in_fight guard: hitplayer() returns "You are already fighting!" if in_fight is set.
    if (inFight.has(actor)) {
      session?.send(refusal("already-fighting"))
      return
    }

    const target = resolveActiveCharacter(name, charactersByName, control, context.sessions)
    if (target === undefined) {
      session?.send(refusal("cant-find-them"))
      return
    }
    if (target.entity === actor) {
      session?.send(refusal("cant-kill-self"))
      return
    }

    const location = context.world?.locationOf(actor)
    if (location === undefined) {
      session?.send(refusal("nowhere"))
      return
    }
    if (context.world?.locationOf(target.entity) !== location) {
      session?.send(refusal("not-here-to-fight"))
      return
    }

    const attackerName = session?.principalId ?? actor

    await executeAttack(
      actor,
      session,
      attackerName,
      target,
      location,
      context,
      runtime,
      objects,
      personas,
      wielding,
      worn,
      store,
      inFight,
      clockId,
      rng,
    )
  })

  runtime.handle(combatRound, async (task, context) => {
    const { actor, target: targetEntity } = task.work.input as {
      actor: EntityId
      target: EntityId
    }

    // Guard: if inFight no longer points to this target, this round was superseded or cancelled.
    if (inFight.get(actor) !== targetEntity) return

    // Validate: target must still be alive (has persona) and in the same room.
    const location = context.world?.locationOf(actor)
    if (location === undefined) {
      inFight.delete(actor)
      return
    }
    if (context.world?.locationOf(targetEntity) !== location) {
      inFight.delete(actor)
      return
    }

    const target = resolveTargetByEntity(targetEntity, control, context.sessions)
    if (target === undefined) {
      inFight.delete(actor)
      return
    }

    // Clear inFight before the attack so it can be re-set for the next round (or left clear on kill).
    inFight.delete(actor)

    const attackerPrincipal = principalControlling(control, actor)
    const attackerSession = attackerPrincipal !== undefined
      ? context.sessions?.activeFor(attackerPrincipal)
      : undefined
    const attackerName: PrincipalId | EntityId = attackerPrincipal ?? actor

    await executeAttack(
      actor,
      attackerSession,
      attackerName,
      target,
      location,
      context,
      runtime,
      objects,
      personas,
      wielding,
      worn,
      store,
      inFight,
      clockId,
      rng,
    )
  })
}
