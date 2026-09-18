import type { Rng } from '../rng.js'
import { anchorSquad } from '../players/gen.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp } from '../world/gen.js'
import { clubById, managerById, spellOf } from '../lookup.js'
import { structuralTarget } from '../tenure/expectation.js'
import { bumpReputation } from '../tenure/exits.js'
import { endSpell, remainingValue, salaryFor, startSpell } from '../tenure/spell.js'
import { addCredit } from '../tenure/credit.js'
import type { Manager, Promise, Spell, Vacancy, World } from '../types.js'
import { salaryForYears } from './vacancies.js'
import { poachable } from './shortlist.js'
import { assignTag } from './tags.js'
import { hasPending, queueApproach, queueOffer } from '../play/decisions.js'

/** The AI's interview promise: promotion when the squad is a contender, stability when it is a struggler. */
export function aiPromise(world: World, vacancy: Vacancy): Promise {
  const club = clubById(world, vacancy.post.clubId)
  const size = T.TIER_SIZES[club.tier - 1] as number
  const structural = structuralTarget(world, vacancy.post)
  if (club.tier > 1 && structural <= T.AI_PROMISE_PROMOTION_RANK) return 'promotion'
  if (structural > size - T.BOTTOM_ZONE) return 'stability'
  return 'top-half'
}

/** Can the hiring club afford the buy-out, or must the manager walk out? */
export function buyoutAffordable(world: World, vacancy: Vacancy, buyout: number): boolean {
  return buyout <= T.BUYOUT_AFFORD_SHARE * clubById(world, vacancy.post.clubId).wageBudget
}

function prestigeOf(world: World, spell: Spell): number {
  return clubById(world, spell.post.clubId).prestige
}

function vacancyPrestigeOf(world: World, vacancy: Vacancy): number {
  return clubById(world, vacancy.post.clubId).prestige
}

export type ApproachOutcome = 'accepted' | 'declined' | 'pending'

/** Turn an approach down: credit and loyalty at the current club. */
export function declineApproach(world: World, spell: Spell, vacancy: Vacancy): void {
  const applied = addCredit(spell, T.DECLINE_APPROACH_CREDIT)
  spell.loyaltyBonus += T.LOYALTY_PER_DECLINE
  emit(world, 'approach.declined', { managerId: spell.managerId, spellId: spell.id, vacancyId: vacancy.id, creditDelta: applied, credit: spell.credit, season: world.season })
}

/** Leave for the calling club: poached with a buy-out, or a walk-out without one; then take the job. */
export function acceptApproach(world: World, rng: Rng, manager: Manager, vacancy: Vacancy, paid: boolean): Spell | null {
  const spell = spellOf(world, manager)
  if (!spell) return null
  const buyout = remainingValue(world, spell)
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
  return hire(world, rng, manager, vacancy)
}

/**
 * A bigger club calls an employed manager. The AI accepts most of the time;
 * if the new club cannot pay the buy-out it must walk out, which it does only
 * for a much bigger club. The human is asked and the vacancy waits.
 */
export function approach(world: World, rng: Rng, manager: Manager, vacancy: Vacancy): ApproachOutcome {
  const spell = spellOf(world, manager)
  if (!spell) return 'declined'
  const buyout = remainingValue(world, spell)
  const paid = buyoutAffordable(world, vacancy, buyout)
  if (manager.isHuman) {
    if (!hasPending(world, 'approach', (d) => d.payload['vacancyId'] === vacancy.id)) {
      emit(world, 'approach.made', { managerId: manager.id, spellId: spell.id, vacancyId: vacancy.id, from: spell.post, to: vacancy.post, buyout, buyoutPaid: paid, season: world.season })
      queueApproach(world, vacancy, buyout, paid)
    }
    return 'pending'
  }
  emit(world, 'approach.made', { managerId: manager.id, spellId: spell.id, vacancyId: vacancy.id, from: spell.post, to: vacancy.post, buyout, buyoutPaid: paid, season: world.season })
  let accept = rng.chance(T.AI_ACCEPT_APPROACH_P)
  if (accept && !paid) {
    const gap = vacancyPrestigeOf(world, vacancy) - prestigeOf(world, spell)
    accept = gap >= T.WALKOUT_MIN_PRESTIGE_GAP && rng.chance(T.AI_WALKOUT_P)
  }
  if (!accept) {
    declineApproach(world, spell, vacancy)
    return 'declined'
  }
  acceptApproach(world, rng, manager, vacancy, paid)
  return 'accepted'
}

/** Contract length for this manager: the vacancy's offer, or a shorter first-job deal for the unproven. */
export function contractYearsFor(rng: Rng, manager: Manager, vacancy: Vacancy): number {
  if (manager.history.spellIds.length > 0) return vacancy.contract.years
  const years = T.FIRST_JOB_CONTRACT_YEARS_WEIGHTS.map((_, i) => i + 1)
  return rng.weighted(years, T.FIRST_JOB_CONTRACT_YEARS_WEIGHTS)
}

export interface HireTermsChoice {
  promise: Promise
  years: number
}

/** Seat the manager on the vacancy's terms, or on the terms the human negotiated. */
export function hire(world: World, rng: Rng, manager: Manager, vacancy: Vacancy, chosen?: HireTermsChoice): Spell {
  const promise = chosen ? chosen.promise : aiPromise(world, vacancy)
  const years = chosen ? chosen.years : contractYearsFor(rng, manager, vacancy)
  const salary = salaryForYears(salaryFor(world, vacancy.post, manager.reputation), years)
  const spell = startSpell(world, rng, manager, vacancy.post, { years, promise, crisis: vacancy.crisis, salary })
  // The squad is the club's strength in the new manager's formation: re-anchor so nobody inherits a side that does not fit.
  if (vacancy.post.kind === 'home') {
    const club = clubById(world, vacancy.post.clubId)
    anchorSquad(world, club, club.squad.strength, manager.isHuman && world.human ? world.human.tactic.formation : manager.preferredFormation)
  }
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

export type FillOutcome = 'filled' | 'waiting' | 'failed'

/** Work down the shortlist; the first taker gets the job. A human on the list is asked, and the club waits a week. */
export function tryToFill(world: World, rng: Rng, vacancy: Vacancy): FillOutcome {
  for (const id of vacancy.shortlist) {
    const manager = managerById(world, id)
    if (manager.status.kind === 'retired') continue
    if (manager.isHuman && world.human) {
      if (world.human.declinedVacancies.includes(vacancy.id)) continue
      if (manager.status.kind === 'employed') {
        if (manager.id !== vacancy.poachTargetId) continue
        if (approach(world, rng, manager, vacancy) === 'pending') return 'waiting'
        continue
      }
      if (manager.status.kind !== 'unemployed') continue
      if (!hasPending(world, 'offer', (d) => d.payload['vacancyId'] === vacancy.id)) queueOffer(world, vacancy)
      return 'waiting'
    }
    if (manager.status.kind === 'employed') {
      // Only the chosen target is called, and only if still poachable: a target who moved since the draw is gone.
      if (manager.id !== vacancy.poachTargetId || !poachable(world, manager, vacancy)) continue
      if (approach(world, rng, manager, vacancy) !== 'accepted') continue
      return 'filled'
    }
    if (manager.status.kind !== 'unemployed') continue
    hire(world, rng, manager, vacancy)
    return 'filled'
  }
  return 'failed'
}

export { clamp }
