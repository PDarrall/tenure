import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import * as T from '../tunables.js'
import { clubById, foreignClubById } from '../lookup.js'
import { isElite } from '../managers/reputation.js'
import { positionOf } from '../season/table.js'
import { seasonWeek } from '../season/calendar.js'
import { normalBudget } from '../season/squad.js'
import { expectationAtHire, structuralTarget } from '../tenure/expectation.js'
import { salaryFor } from '../tenure/spell.js'
import type { Post, Tag, Vacancy, VacancyReason, World } from '../types.js'

export function openVacancies(world: World): Vacancy[] {
  return world.vacancies.filter((v) => v.filledWeek === null)
}

function hasOpenVacancy(world: World, post: Post): boolean {
  return openVacancies(world).some((v) => v.post.kind === post.kind && v.post.clubId === post.clubId)
}

/** Why the last manager left, from the most recent ended spell at the post. */
function lastReason(world: World, post: Post): VacancyReason {
  for (let i = world.spells.length - 1; i >= 0; i--) {
    const s = world.spells[i] as { post: Post; endReason: VacancyReason | null }
    if (s.post.kind === post.kind && s.post.clubId === post.clubId && s.endReason) return s.endReason
  }
  return 'unknown'
}

/** Is a club in the bottom zone right now (during the season, once games have been played)? */
export function inBottomZone(world: World, clubId: number): boolean {
  if (seasonWeek(world.week) >= T.MATCH_WEEKS) return false
  const row = world.tables.find((r) => r.clubId === clubId)
  if (!row || row.played === 0) return false
  const club = clubById(world, clubId)
  const size = T.TIER_SIZES[club.tier - 1] as number
  return positionOf(world, clubId) > size - T.BOTTOM_ZONE
}

/** Crisis: bottom zone, just relegated, or predecessor sacked mid-season. */
export function isCrisis(world: World, post: Post, reason: VacancyReason, openedWeek: number): boolean {
  if (post.kind !== 'home') return false
  const club = clubById(world, post.clubId)
  const justRelegated =
    club.lastRelegatedSeason === world.season ||
    (club.lastRelegatedSeason === world.season - 1 && seasonWeek(world.week) < T.MONTH_WEEKS * 2)
  const sackedMidSeason = reason === 'sacked' && seasonWeek(openedWeek) < T.MATCH_WEEKS
  return justRelegated || sackedMidSeason || inBottomZone(world, post.clubId)
}

/** Typecasting: what the board says it wants. */
export function wantTags(world: World, post: Post): Tag[] {
  const tags: Tag[] = []
  if (post.kind !== 'home') return tags
  const club = clubById(world, post.clubId)
  const size = T.TIER_SIZES[club.tier - 1] as number
  const structural = structuralTarget(world, post)
  if (inBottomZone(world, club.id) || club.lastRelegatedSeason === world.season || structural > size - T.BOTTOM_ZONE) {
    tags.push('survival specialist')
  }
  if (club.tier > 1 && structural <= T.AI_PROMISE_PROMOTION_RANK) tags.push('promotion specialist')
  if (club.wealth < T.LOW_WEALTH) tags.push('youth developer')
  if (isElite(world, club)) tags.push('cup manager')
  if (club.owner.type === 'impatient') tags.push('overachiever')
  if (club.owner.type === 'patient') tags.push('loyal')
  return tags.slice(0, T.WANT_TAGS_MAX)
}

function drawYears(rng: Rng): number {
  const years = T.CONTRACT_YEARS_WEIGHTS.map((_, i) => i + 1)
  return rng.weighted(years, T.CONTRACT_YEARS_WEIGHTS)
}

/** Salary for a contract length: longer pays less per year. */
export function salaryForYears(base: number, years: number): number {
  return Math.round(base * (1 - T.SALARY_PER_YEAR_FACTOR * (years - 2)) * 100) / 100
}

function openVacancy(world: World, rng: Rng, post: Post): Vacancy {
  const reason = lastReason(world, post)
  const years = drawYears(rng)
  const bandMidReputation = 50
  const vacancy: Vacancy = {
    id: world.nextVacancyId++,
    post,
    openedWeek: world.week,
    reason,
    ownerType: post.kind === 'home' ? clubById(world, post.clubId).owner.type : 'normal',
    expectation: expectationAtHire(world, post, 'top-half'),
    budget: post.kind === 'home' ? normalBudget(clubById(world, post.clubId)) : 0,
    contract: { years, salary: salaryForYears(salaryFor(world, post, bandMidReputation), years) },
    wantTags: wantTags(world, post),
    applicants: [],
    shortlist: [],
    widened: 0,
    crisis: isCrisis(world, post, reason, world.week),
    filledWeek: null,
    hiredManagerId: null,
  }
  world.vacancies.push(vacancy)
  emit(world, 'vacancy.opened', {
    vacancyId: vacancy.id,
    post,
    reason,
    ownerType: vacancy.ownerType,
    expectation: vacancy.expectation,
    budget: vacancy.budget,
    years,
    salary: vacancy.contract.salary,
    wantTags: [...vacancy.wantTags],
    crisis: vacancy.crisis,
    season: world.season,
  })
  return vacancy
}

/** Every post without a manager and without an open vacancy gets one. */
export function openNewVacancies(world: World, rng: Rng): Vacancy[] {
  const opened: Vacancy[] = []
  for (const club of world.clubs) {
    const post: Post = { kind: 'home', clubId: club.id }
    if (club.managerId === null && !hasOpenVacancy(world, post)) opened.push(openVacancy(world, rng, post))
  }
  for (const league of world.foreign) {
    for (const club of league.clubs) {
      const post: Post = { kind: 'abroad', league: league.kind, clubId: club.id }
      if (club.managerId === null && !hasOpenVacancy(world, post)) opened.push(openVacancy(world, rng, post))
    }
  }
  return opened
}

export function vacancyPrestige(world: World, vacancy: Vacancy): number {
  if (vacancy.post.kind === 'home') return clubById(world, vacancy.post.clubId).prestige
  return foreignClubById(world, vacancy.post.clubId)?.prestige ?? 0
}
