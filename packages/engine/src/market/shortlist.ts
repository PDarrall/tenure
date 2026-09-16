import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clubById, foreignClubById, spellOf } from '../lookup.js'
import { bandIndex, clubBandIndex, foreignBandIndex } from '../managers/reputation.js'
import type { Manager, Vacancy, World } from '../types.js'
import { vacancyPrestige } from './vacancies.js'

/** Band the vacancy recruits from. */
export function vacancyBand(world: World, vacancy: Vacancy): number {
  return vacancy.post.kind === 'home' ? clubBandIndex(world, clubById(world, vacancy.post.clubId)) : foreignBandIndex(vacancy.post.league)
}

export function monthsUnemployed(world: World, manager: Manager): number {
  if (manager.status.kind !== 'unemployed') return 0
  return Math.floor((world.week - manager.status.sinceWeek) / T.MONTH_WEEKS)
}

function hasWantedTag(manager: Manager, vacancy: Vacancy): boolean {
  return manager.tags.some((t) => vacancy.wantTags.includes(t.tag))
}

/** DESIGN: band covers the tier, or one band below with a matching tag; widened searches relax this. */
export function qualifies(world: World, manager: Manager, vacancy: Vacancy): boolean {
  const need = vacancyBand(world, vacancy) - vacancy.widened
  const have = bandIndex(manager.reputation)
  if (have >= need) return true
  return have >= need - T.TAG_BAND_BELOW && hasWantedTag(manager, vacancy)
}

/**
 * Would an AI manager put itself forward? Unemployed managers aim no lower
 * than one band below their own, and take a short break after losing a job.
 */
export function wouldApply(world: World, manager: Manager, vacancy: Vacancy): boolean {
  if (manager.status.kind === 'retired') return false
  if (manager.status.kind === 'employed') return false
  if (manager.history.spellIds.length > 0 && monthsUnemployed(world, manager) < T.AI_REST_MONTHS_AFTER_EXIT) return false
  if (vacancy.post.kind === 'abroad') {
    const native = manager.nationality === vacancy.post.league
    if (!native && manager.status.activity !== 'abroad') return false
  }
  if (monthsUnemployed(world, manager) >= T.AI_APPLY_ANY_AFTER_MONTHS) return true
  return bandIndex(manager.reputation) - T.AI_APPLY_BANDS_BELOW <= vacancyBand(world, vacancy)
}

/** Employed managers a bigger club might call. */
export function poachable(world: World, manager: Manager, vacancy: Vacancy): boolean {
  if (manager.status.kind !== 'employed') return false
  const spell = spellOf(world, manager)
  if (!spell) return false
  if (world.week - spell.startWeek < T.POACH_MIN_WEEKS) return false
  const current =
    spell.post.kind === 'home' ? clubById(world, spell.post.clubId).prestige : (foreignClubById(world, spell.post.clubId)?.prestige ?? 0)
  return vacancyPrestige(world, vacancy) >= current + T.POACH_PRESTIGE_GAP
}

export function agePenalty(age: number): number {
  let mult = 1
  for (const step of T.AGE_PENALTY) if (age >= step.from) mult = step.mult
  return mult
}

export function shortlistScore(rng: Rng, manager: Manager, vacancy: Vacancy): number {
  const fit = vacancy.wantTags.length === 0 ? 0 : manager.tags.filter((t) => vacancy.wantTags.includes(t.tag)).length / vacancy.wantTags.length
  const w = T.SHORTLIST_WEIGHTS
  const score = (w.reputation * manager.reputation) / 100 + w.tagFit * fit + (w.agent * manager.agent) / 100 + w.random * rng.float()
  return score * agePenalty(manager.age)
}

/**
 * Draw the shortlist from qualified applicants, best scores first. Some
 * vacancies also call one employed manager: the best poachable fit goes to
 * the top of the list, so "a bigger club calls" stays an event, not a flood.
 */
export function drawShortlist(world: World, rng: Rng, vacancy: Vacancy): Manager[] {
  const candidates = world.managers.filter((m) => !m.isHuman && qualifies(world, m, vacancy) && wouldApply(world, m, vacancy))
  for (const m of candidates) if (!vacancy.applicants.includes(m.id)) vacancy.applicants.push(m.id)
  const scored = candidates.map((m) => ({ m, score: shortlistScore(rng, m, vacancy) }))
  scored.sort((a, b) => b.score - a.score || a.m.id - b.m.id)
  const size = rng.int(T.SHORTLIST_SIZE[0], T.SHORTLIST_SIZE[1])
  const picked = scored.slice(0, size).map((s) => s.m)
  // A human who applied and qualifies has a chance of the list, and interviews first.
  if (world.human && vacancy.applicants.includes(world.human.managerId) && !world.human.declinedVacancies.includes(vacancy.id)) {
    const player = world.managers[world.human.managerId - 1] as Manager
    if (player.status.kind === 'unemployed' && qualifies(world, player, vacancy) && rng.chance(T.HUMAN_SHORTLIST_P)) {
      picked.unshift(player)
      if (picked.length > T.SHORTLIST_SIZE[1]) picked.pop()
    }
  }
  // One call to an employed manager per vacancy, decided on the first draw.
  if (vacancy.shortlist.length === 0 && vacancy.widened === 0 && rng.chance(T.POACH_ATTEMPT_P)) {
    const targets = world.managers
      .filter((m) => !m.isHuman && qualifies(world, m, vacancy) && poachable(world, m, vacancy))
      .map((m) => ({ m, score: shortlistScore(rng, m, vacancy) }))
      .sort((a, b) => b.score - a.score || a.m.id - b.m.id)
    const best = targets[0]
    if (best) {
      picked.unshift(best.m)
      vacancy.poachTargetId = best.m.id
      if (picked.length > T.SHORTLIST_SIZE[1]) picked.pop()
    }
  }
  // An employed human who applied is called like any poach target, once in post a season.
  if (world.human && vacancy.poachTargetId === null && vacancy.applicants.includes(world.human.managerId)) {
    const player = world.managers[world.human.managerId - 1] as Manager
    if (player.status.kind === 'employed' && qualifies(world, player, vacancy) && poachable(world, player, vacancy)) {
      picked.unshift(player)
      vacancy.poachTargetId = player.id
      if (picked.length > T.SHORTLIST_SIZE[1]) picked.pop()
    }
  }
  vacancy.shortlist = picked.map((m) => m.id)
  for (const m of picked) {
    if (m.status.kind === 'unemployed') m.status.monthsSinceShortlisted = 0
    emit(world, 'vacancy.shortlisted', { vacancyId: vacancy.id, managerId: m.id, post: vacancy.post, employed: m.status.kind === 'employed', season: world.season })
  }
  return picked
}
