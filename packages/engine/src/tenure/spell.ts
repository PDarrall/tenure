import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { clubById, foreignClubById } from '../lookup.js'
import { isElite } from '../managers/reputation.js'
import { seasonWeek } from '../season/calendar.js'
import type { Manager, OwnerType, Post, Promise, Spell, SpellEndReason, World } from '../types.js'
import { expectationAtHire, structuralTarget } from './expectation.js'
import { ceilingFor } from './credit.js'

export { ceilingFor }

export function thresholdFor(rng: Rng, owner: OwnerType): number {
  if (owner === 'erratic') return rng.int(T.SACK_THRESHOLD_ERRATIC[0], T.SACK_THRESHOLD_ERRATIC[1])
  return T.SACK_THRESHOLD[owner]
}

export function ownerTypeOf(world: World, post: Post): OwnerType {
  return post.kind === 'home' ? clubById(world, post.clubId).owner.type : 'normal'
}

/** £m per season for a post at a reputation. DESIGN: salary by tier × reputation. */
export function salaryFor(world: World, post: Post, reputation: number): number {
  const base =
    post.kind === 'home'
      ? (T.SALARY_BASE_BY_TIER[clubById(world, post.clubId).tier - 1] as number)
      : T.SALARY_BASE_ABROAD[post.league]
  return round1(base * (T.SALARY_REP_FLOOR + reputation / 100) * 10) / 10
}

/**
 * Global week a contract of `years` signed now runs to: the season-end week
 * of its last season. A contract signed mid-season counts that season as its
 * first; one signed in the summer starts with the season about to begin.
 */
export function contractEndWeek(world: World, years: number): number {
  const sw = seasonWeek(world.week)
  const firstSeasonIndex = sw >= T.MATCH_WEEKS ? world.season : world.season - 1
  return (firstSeasonIndex + Math.max(1, years) - 1) * T.SEASON_WEEKS + T.MATCH_WEEKS
}

/** Whole contract years left, rounded up. */
export function yearsLeft(world: World, spell: Spell): number {
  return Math.max(0, Math.ceil((spell.contract.endWeek - world.week) / T.SEASON_WEEKS))
}

/** £m still owed on the contract. */
export function remainingValue(world: World, spell: Spell): number {
  const weeks = Math.max(0, spell.contract.endWeek - world.week)
  return round1((spell.contract.salary * weeks) / T.SEASON_WEEKS)
}

export interface HireTerms {
  years: number
  promise: Promise
  crisis: boolean
  /** Override the tier × reputation salary (interview trade-offs). */
  salary?: number
  genesis?: boolean
  /** Genesis only: seasons already served at the club. */
  servedSeasons?: number
}

/** Create a spell, seat the manager, and log the hire. */
export function startSpell(world: World, rng: Rng, manager: Manager, post: Post, terms: HireTerms): Spell {
  if (manager.status.kind === 'employed') throw new Error(`startSpell: manager ${manager.id} is already employed`)
  const occupant = post.kind === 'home' ? clubById(world, post.clubId).managerId : (foreignClubById(world, post.clubId)?.managerId ?? null)
  if (occupant !== null) throw new Error(`startSpell: post ${post.clubId} is not vacant`)
  const served = terms.servedSeasons ?? 0
  const ceiling = ceilingFor(served)
  const eliteHire = post.kind === 'home' && isElite(world, clubById(world, post.clubId))
  const credit = clamp(
    T.CREDIT_ON_HIRE + (terms.crisis ? T.CREDIT_CRISIS_BONUS : 0) + (eliteHire ? T.CREDIT_ELITE_PENALTY : 0),
    0,
    ceiling,
  )
  const spell: Spell = {
    id: world.nextSpellId++,
    managerId: manager.id,
    post,
    startWeek: world.week - served * T.SEASON_WEEKS,
    endWeek: null,
    endReason: null,
    contract: {
      endWeek: contractEndWeek(world, terms.years),
      salary: terms.salary ?? salaryFor(world, post, manager.reputation),
      yearsAtSigning: terms.years,
      promise: terms.promise,
    },
    budgetMultiplier: T.PROMISE_EFFECTS[terms.promise].budget,
    expectation: expectationAtHire(world, post, terms.promise),
    structuralTarget: structuralTarget(world, post),
    credit,
    ceiling,
    threshold: thresholdFor(rng, ownerTypeOf(world, post)),
    seasonsCompleted: served,
    ownership: clamp(served * T.GENESIS_OWNERSHIP_PER_SEASON, 0, 1),
    weeksBelowThreshold: 0,
    consecutiveDefeats: 0,
    crisisHire: terms.crisis,
    loyaltyBonus: 0,
    takeover: null,
    falloutRolled: false,
    season: { games: 0, points: 0, xiTurnover: 0, fallouts: 0, boardRows: 0, earned: 0 },
    payout: 0,
    deserved: null,
    pendingReset: null,
  }
  world.spells.push(spell)
  manager.status = { kind: 'employed', post, spellId: spell.id }
  manager.history.spellIds.push(spell.id)
  if (post.kind === 'home') clubById(world, post.clubId).managerId = manager.id
  else {
    const club = foreignClubById(world, post.clubId)
    if (!club) throw new Error(`startSpell: no foreign club ${post.clubId}`)
    club.managerId = manager.id
  }
  emit(world, 'manager.hired', {
    managerId: manager.id,
    spellId: spell.id,
    post,
    years: terms.years,
    salary: spell.contract.salary,
    promise: terms.promise,
    crisis: terms.crisis,
    expectation: spell.expectation,
    credit: spell.credit,
    ceiling: spell.ceiling,
    seasonsServed: served,
    genesis: terms.genesis === true,
    season: world.season,
  })
  return spell
}

/** Close a spell: pay out, free the club, make the manager unemployed. Callers log the reason. */
export function endSpell(world: World, spell: Spell, reason: SpellEndReason, payoutShare: number): void {
  const manager = world.managers[spell.managerId - 1]
  if (!manager || manager.id !== spell.managerId) throw new Error(`endSpell: no manager ${spell.managerId}`)
  spell.endWeek = world.week
  spell.endReason = reason
  spell.payout = round1(remainingValue(world, spell) * payoutShare)
  manager.history.earnings += spell.payout
  if (spell.payout > 0) {
    emit(world, 'earnings.payout', { managerId: manager.id, spellId: spell.id, amount: spell.payout, reason })
  }
  emit(world, 'earnings.spell', { managerId: manager.id, spellId: spell.id, salaryThisSeason: round1(spell.season.earned) })
  if (spell.post.kind === 'home') {
    const club = clubById(world, spell.post.clubId)
    if (club.managerId === manager.id) club.managerId = null
  } else {
    const club = foreignClubById(world, spell.post.clubId)
    if (club && club.managerId === manager.id) club.managerId = null
  }
  manager.status = { kind: 'unemployed', sinceWeek: world.week, activity: 'wait', monthsSinceShortlisted: 0 }
}

/** Spells still running. */
export function activeSpells(world: World): Spell[] {
  return world.spells.filter((s) => s.endWeek === null)
}

/** Genesis: seat incumbents with a random tenure already served and a contract still to run. */
export function seatIncumbents(world: World, rng: Rng, assignments: { managerId: number; post: Post }[]): void {
  for (const { managerId, post } of assignments) {
    const manager = world.managers[managerId - 1]
    if (!manager || manager.id !== managerId) throw new Error(`seatIncumbents: no manager ${managerId}`)
    const years = rng.int(T.GENESIS_CONTRACT_YEARS[0], T.GENESIS_CONTRACT_YEARS[1])
    const served = rng.int(T.GENESIS_TENURE_SEASONS[0], T.GENESIS_TENURE_SEASONS[1])
    startSpell(world, rng, manager, post, { years, promise: 'top-half', crisis: false, genesis: true, servedSeasons: served })
  }
}
