import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import * as T from '../tunables.js'
import { clamp } from '../world/gen.js'
import { clubById, foreignClubById, managerById, spellOf } from '../lookup.js'
import { structuralTarget } from '../tenure/expectation.js'
import { bumpReputation } from '../tenure/exits.js'
import { endSpell, remainingValue, salaryFor, startSpell } from '../tenure/spell.js'
import { addCredit } from '../tenure/credit.js'
import type { Manager, Promise, Spell, Vacancy, World } from '../types.js'
import { salaryForYears } from './vacancies.js'
import { assignTag } from './tags.js'

/** The AI's interview promise: promotion when the squad is a contender, stability when it is a struggler. */
export function aiPromise(world: World, vacancy: Vacancy): Promise {
  if (vacancy.post.kind !== 'home') return 'top-half'
  const club = clubById(world, vacancy.post.clubId)
  const size = T.TIER_SIZES[club.tier - 1] as number
  const structural = structuralTarget(world, vacancy.post)
  if (club.tier > 1 && structural <= T.AI_PROMISE_PROMOTION_RANK) return 'promotion'
  if (structural > size - T.BOTTOM_ZONE) return 'stability'
  return 'top-half'
}

/** Can the hiring club afford the buy-out, or must the manager walk out? */
export function buyoutAffordable(world: World, vacancy: Vacancy, buyout: number): boolean {
  if (vacancy.post.kind !== 'home') return true
  return buyout <= T.BUYOUT_AFFORD_SHARE * clubById(world, vacancy.post.clubId).wageBudget
}

function prestigeOf(world: World, spell: Spell): number {
  return spell.post.kind === 'home' ? clubById(world, spell.post.clubId).prestige : (foreignClubById(world, spell.post.clubId)?.prestige ?? 0)
}

function vacancyPrestigeOf(world: World, vacancy: Vacancy): number {
  return vacancy.post.kind === 'home' ? clubById(world, vacancy.post.clubId).prestige : (foreignClubById(world, vacancy.post.clubId)?.prestige ?? 0)
}

/**
 * A bigger club calls an employed manager. The AI accepts most of the time;
 * if the new club cannot pay the buy-out it must walk out, which it does only
 * for a much bigger club. Returns true if the manager is coming.
 */
export function approach(world: World, rng: Rng, manager: Manager, vacancy: Vacancy): boolean {
  const spell = spellOf(world, manager)
  if (!spell) return false
  const buyout = remainingValue(world, spell)
  const paid = buyoutAffordable(world, vacancy, buyout)
  emit(world, 'approach.made', { managerId: manager.id, spellId: spell.id, vacancyId: vacancy.id, from: spell.post, to: vacancy.post, buyout, buyoutPaid: paid, season: world.season })
  if (manager.isHuman) return false
  let accept = rng.chance(T.AI_ACCEPT_APPROACH_P)
  if (accept && !paid) {
    const gap = vacancyPrestigeOf(world, vacancy) - prestigeOf(world, spell)
    accept = gap >= T.WALKOUT_MIN_PRESTIGE_GAP && rng.chance(T.AI_WALKOUT_P)
  }
  if (!accept) {
    const applied = addCredit(spell, T.DECLINE_APPROACH_CREDIT)
    spell.loyaltyBonus += T.LOYALTY_PER_DECLINE
    emit(world, 'approach.declined', { managerId: manager.id, spellId: spell.id, vacancyId: vacancy.id, creditDelta: applied, credit: spell.credit, season: world.season })
    return false
  }
  if (paid) {
    endSpell(world, spell, 'poached', 0)
    if (spell.post.kind === 'home') clubById(world, spell.post.clubId).cash += buyout
    bumpReputation(world, manager.id, T.REP_POACHED, 'poached')
    assignTag(world, manager, 'in demand')
    emit(world, 'manager.poached', { managerId: manager.id, spellId: spell.id, from: spell.post, to: vacancy.post, buyout, season: world.season })
  } else {
    endSpell(world, spell, 'resigned', 0)
    manager.history.walkouts++
    bumpReputation(world, manager.id, T.REP_WALKOUT, 'walked out')
    emit(world, 'manager.walkedOut', { managerId: manager.id, spellId: spell.id, from: spell.post, to: vacancy.post, walkouts: manager.history.walkouts, season: world.season })
  }
  return true
}

/** Seat the manager on the vacancy's terms. */
export function hire(world: World, rng: Rng, manager: Manager, vacancy: Vacancy): Spell {
  const promise = manager.isHuman ? 'top-half' : aiPromise(world, vacancy)
  const years = vacancy.contract.years
  const salary = salaryForYears(salaryFor(world, vacancy.post, manager.reputation), years)
  const spell = startSpell(world, rng, manager, vacancy.post, { years, promise, crisis: vacancy.crisis, salary })
  vacancy.filledWeek = world.week
  vacancy.hiredManagerId = manager.id
  emit(world, 'vacancy.filled', {
    vacancyId: vacancy.id,
    managerId: manager.id,
    spellId: spell.id,
    post: vacancy.post,
    weeksOpen: world.week - vacancy.openedWeek,
    widened: vacancy.widened,
    shortlist: [...vacancy.shortlist],
    season: world.season,
  })
  return spell
}

/** Work down the shortlist; the first taker gets the job. */
export function tryToFill(world: World, rng: Rng, vacancy: Vacancy): boolean {
  for (const id of vacancy.shortlist) {
    const manager = managerById(world, id)
    if (manager.status.kind === 'retired') continue
    if (manager.isHuman) continue
    if (manager.status.kind === 'employed') {
      if (!approach(world, rng, manager, vacancy)) continue
    }
    if (manager.status.kind !== 'unemployed') continue
    hire(world, rng, manager, vacancy)
    return true
  }
  return false
}

export { clamp }
