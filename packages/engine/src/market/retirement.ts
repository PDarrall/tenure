import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { spellOf } from '../lookup.js'
import { endSpell } from '../tenure/spell.js'
import type { Manager, RetirementReason, World } from '../types.js'

/** The career ends: any spell closes, the score is banked. */
export function endCareer(world: World, manager: Manager, reason: RetirementReason): void {
  if (manager.status.kind === 'retired') return
  const spell = spellOf(world, manager)
  if (spell) {
    endSpell(world, spell, 'retired', 0)
    emit(world, 'manager.retired', { managerId: manager.id, spellId: spell.id, post: spell.post, reason, season: world.season })
  }
  manager.status = { kind: 'retired', week: world.week, reason }
  emit(world, 'career.ended', {
    managerId: manager.id,
    reason,
    age: manager.age,
    games: manager.history.games,
    earnings: Math.round(manager.history.earnings * 100) / 100,
    trophyPoints: manager.history.trophyPoints,
    playersMade: manager.history.playersMade,
    spells: manager.history.spellIds.length,
    season: world.season,
  })
}

/** Season-end retirements: the age limit, and the AI choosing to go. */
export function seasonRetirements(world: World, rng: Rng): void {
  for (const manager of world.managers) {
    if (manager.status.kind === 'retired') continue
    if (manager.age >= T.RETIRE_AGE) {
      endCareer(world, manager, 'age')
      continue
    }
    if (manager.isHuman || manager.age < T.AI_RETIRE_FROM) continue
    let p = T.AI_RETIRE_BASE_P + T.AI_RETIRE_PER_YEAR * (manager.age - T.AI_RETIRE_FROM)
    if (manager.status.kind === 'unemployed') p *= T.AI_RETIRE_UNEMPLOYED_MULT
    if (rng.chance(p)) endCareer(world, manager, 'voluntary')
  }
}

/** Scandals can strike the employed too. */
export function monthlyScandals(world: World, rng: Rng): void {
  for (const manager of world.managers) {
    if (manager.status.kind !== 'employed') continue
    if (rng.chance(T.SCANDAL_P)) endCareer(world, manager, 'scandal')
  }
}
