import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp } from '../world/gen.js'
import { managerById } from '../lookup.js'
import type { Spell, World } from '../types.js'
import { contractEndWeek, endSpell, salaryFor } from './spell.js'

function bumpReputation(world: World, managerId: number, delta: number, reason: string): number {
  const manager = managerById(world, managerId)
  const before = manager.reputation
  manager.reputation = clamp(manager.reputation + delta, 0, 100)
  const applied = manager.reputation - before
  emit(world, 'reputation.changed', { managerId, delta: applied, reason, reputation: manager.reputation, season: world.season })
  return applied
}

/** Mutual consent: half payout, −4 reputation. */
export function leaveByMutualConsent(world: World, spell: Spell): void {
  endSpell(world, spell, 'mutual', T.MUTUAL_PAYOUT_SHARE)
  bumpReputation(world, spell.managerId, T.REP_MUTUAL, 'mutual consent')
  emit(world, 'manager.mutual', { managerId: spell.managerId, spellId: spell.id, post: spell.post, payout: spell.payout, credit: spell.credit, season: world.season })
}

/** Resign: no payout; −1 if leaving on a high, −5 otherwise. */
export function resign(world: World, spell: Spell): void {
  const delta = spell.credit > T.RESIGN_CREDIT_SPLIT ? T.REP_RESIGN_HIGH : T.REP_RESIGN_LOW
  endSpell(world, spell, 'resigned', 0)
  bumpReputation(world, spell.managerId, delta, 'resigned')
  emit(world, 'manager.resigned', { managerId: spell.managerId, spellId: spell.id, post: spell.post, credit: spell.credit, season: world.season })
}

/** The board offers mutual consent while credit sits in the window; the AI sometimes takes it. */
export function monthlyMutualConsent(world: World, rng: Rng, spell: Spell): boolean {
  if (spell.credit < T.MUTUAL_WINDOW[0] || spell.credit > T.MUTUAL_WINDOW[1]) return false
  emit(world, 'manager.mutualOffered', { managerId: spell.managerId, spellId: spell.id, credit: spell.credit, season: world.season })
  const manager = managerById(world, spell.managerId)
  if (manager.isHuman) return false
  if (rng.chance(T.AI_MUTUAL_ACCEPT_P)) {
    leaveByMutualConsent(world, spell)
    return true
  }
  return false
}

/** AI managers sometimes jump before they are pushed. */
export function monthlyResignation(world: World, rng: Rng, spell: Spell): boolean {
  const manager = managerById(world, spell.managerId)
  if (manager.isHuman) return false
  if (spell.credit < spell.threshold && rng.chance(T.AI_RESIGN_P)) {
    resign(world, spell)
    return true
  }
  return false
}

/** Contract expiry: renewed on good credit, otherwise released. Returns true if the spell ended. */
export function checkExpiry(world: World, spell: Spell): boolean {
  if (world.week !== spell.contract.endWeek) return false
  const manager = managerById(world, spell.managerId)
  if (spell.credit > T.EXPIRY_RENEW_CREDIT) {
    spell.contract = {
      endWeek: contractEndWeek(world, T.RENEW_YEARS),
      salary: salaryFor(world, spell.post, manager.reputation),
      yearsAtSigning: T.RENEW_YEARS,
      promise: spell.contract.promise,
    }
    emit(world, 'contract.renewed', { managerId: manager.id, spellId: spell.id, years: T.RENEW_YEARS, salary: spell.contract.salary, endWeek: spell.contract.endWeek, season: world.season })
    return false
  }
  endSpell(world, spell, 'expired', 0)
  bumpReputation(world, manager.id, T.REP_RELEASED, 'released at expiry')
  emit(world, 'contract.expired', { managerId: manager.id, spellId: spell.id, post: spell.post, credit: spell.credit, season: world.season })
  return true
}

export { bumpReputation }
