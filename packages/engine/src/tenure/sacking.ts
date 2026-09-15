import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { managerById } from '../lookup.js'
import type { Spell, World } from '../types.js'
import { endSpell, yearsLeft } from './spell.js'
import { bumpReputation } from './exits.js'

/** Weekly roll while below threshold: 10% × (1 − 0.2 × years left), floor 3%. */
export function rollProbability(world: World, spell: Spell): number {
  return Math.max(T.SACK_ROLL_FLOOR, T.SACK_ROLL_BASE * (1 - T.SACK_ROLL_PER_YEAR * yearsLeft(world, spell)))
}

export type SackCause = 'credit' | 'takeover'

/**
 * Sack: full payout, reputation hit by whether it was deserved. Deserved
 * means eight weeks of the spell spent below the threshold, or a collapse
 * to the instant-sack line; a takeover replacement never is.
 */
export function sack(world: World, spell: Spell, cause: SackCause): void {
  const manager = managerById(world, spell.managerId)
  const deserved = cause === 'credit' && (spell.weeksBelowThreshold >= T.DESERVED_WEEKS || spell.credit <= T.CREDIT_INSTANT_SACK)
  spell.deserved = deserved
  const repDelta = bumpReputation(world, manager.id, deserved ? T.REP_SACKED_DESERVED : T.REP_SACKED_UNJUST, deserved ? 'sacked (deserved)' : 'sacked (unjust)')
  endSpell(world, spell, 'sacked', 1)
  emit(world, 'manager.sacked', {
    managerId: manager.id,
    spellId: spell.id,
    post: spell.post,
    cause,
    deserved,
    credit: spell.credit,
    threshold: spell.threshold,
    weeksBelowThreshold: spell.weeksBelowThreshold,
    payout: spell.payout,
    reputationDelta: repDelta,
    reputation: manager.reputation,
    spellWeeks: world.week - spell.startWeek,
    season: world.season,
  })
}

/** The board's weekly look at the manager. Returns true if the spell ended. */
export function weeklySackingCheck(world: World, rng: Rng, spell: Spell): boolean {
  if (spell.takeover && world.week >= spell.takeover.replaceWeek) {
    sack(world, spell, 'takeover')
    return true
  }
  if (spell.credit <= T.CREDIT_INSTANT_SACK) {
    if (spell.credit < spell.threshold) spell.weeksBelowThreshold++
    sack(world, spell, 'credit')
    return true
  }
  if (spell.credit < spell.threshold) {
    spell.weeksBelowThreshold++
    const p = rollProbability(world, spell)
    emit(world, 'board.roll', { spellId: spell.id, managerId: spell.managerId, credit: spell.credit, threshold: spell.threshold, p })
    if (rng.chance(p)) {
      sack(world, spell, 'credit')
      return true
    }
  }
  return false
}
