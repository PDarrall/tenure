/**
 * Club levels and the stadium (DESIGN.md "Club", "Requests"): four levels,
 * 1–5, that wealth sets and only a granted request raises — coaching for
 * growth, scouting for the director, medical for injuries, academy for the
 * intake — and a stadium whose capacity caps attendance and which only a
 * granted request expands: a cash hit and a season of works, then more
 * seats, and wealth rising over three seasons. Every effect is centred on
 * LEVEL_NEUTRAL, the level of a club of middling wealth, so the population
 * reads as before.
 */
import { T } from '../tunables.js'
import { emit } from '../events.js'
import { clamp, round1 } from '../world/gen.js'
import { formScore } from '../match/model.js'
import type { Club, ClubLevels, LevelName, Stadium, StadiumExpansion, Tier, World } from '../types.js'

export const LEVEL_NAMES: readonly LevelName[] = ['coaching', 'scouting', 'medical', 'academy']

/** The level wealth implies: one per LEVEL_WEALTH_STEP points, from 1, capped. */
export function levelFromWealth(wealth: number): number {
  return clamp(1 + Math.floor(wealth / T.LEVEL_WEALTH_STEP), 1, T.LEVEL_MAX)
}

export function levelsFor(wealth: number): ClubLevels {
  const level = levelFromWealth(wealth)
  return { coaching: level, scouting: level, medical: level, academy: level }
}

/** How far a level sits from the neutral one, the unit every effect scales by. */
function fromNeutral(level: number): number {
  return level - T.LEVEL_NEUTRAL
}

/** Coaching: the multiplier on growth with minutes. */
export function coachingFactor(level: number): number {
  return 1 + T.COACHING_DEV_PER_LEVEL * fromNeutral(level)
}

/** Medical: the weeks an injury keeps a player out, never under one. */
export function injuryWeeksAt(weeks: number, level: number): number {
  if (weeks <= 0) return 0
  return Math.max(1, Math.round(weeks * (1 - T.MEDICAL_INJURY_PER_LEVEL * fromNeutral(level))))
}

/** Academy: what the level adds to the summer intake's rating and potential. */
export function academyRatingBonus(level: number): number {
  return T.ACADEMY_RATING_PER_LEVEL * fromNeutral(level)
}

export function academyPotentialBonus(level: number): number {
  return T.ACADEMY_POTENTIAL_PER_LEVEL * fromNeutral(level)
}

/** Scouting: what the level adds to the director's judgement. */
export function scoutingJudgementBonus(level: number): number {
  return T.DIRECTOR_JUDGEMENT_PER_SCOUTING_LEVEL * fromNeutral(level)
}

/** Capacity in thousands a club of this tier and prestige would have built. */
export function capacityFor(tier: Tier, prestige: number): number {
  const base = T.STADIUM_CAPACITY_BY_TIER[tier - 1] ?? (T.STADIUM_CAPACITY_BY_TIER[T.STADIUM_CAPACITY_BY_TIER.length - 1] as number)
  const raw = base * (1 + T.STADIUM_CAPACITY_PRESTIGE_SLOPE * ((prestige - 50) / 50))
  return Math.max(T.STADIUM_CAPACITY_STEP, Math.round(raw / T.STADIUM_CAPACITY_STEP) * T.STADIUM_CAPACITY_STEP)
}

export function stadiumFor(tier: Tier, prestige: number): Stadium {
  return { capacity: capacityFor(tier, prestige), expansion: null, added: 0 }
}

/** Are the works on: granted this season and the new seats not yet in. */
export function worksOn(world: World, club: Club): boolean {
  const e = club.stadium.expansion
  return e !== null && e.season === world.season && club.stadium.capacity === e.from
}

/** Seats on sale this season: the works take a share until the season ends. */
export function effectiveCapacity(world: World, club: Club): number {
  const e = club.stadium.expansion
  if (e && worksOn(world, club)) return round1(e.from * (1 - T.STADIUM_WORKS_CUT))
  return club.stadium.capacity
}

/** Thousands through the gate: demand from tier, prestige and form, capped by the seats on sale. */
export function attendanceOf(world: World, club: Club): number {
  const demand = capacityFor(club.tier, club.prestige) * (T.ATTENDANCE_DEMAND_BASE + T.ATTENDANCE_FORM_SWING * formScore(club.form))
  return round1(Math.min(demand, effectiveCapacity(world, club)))
}

/** Near capacity: the stadium is what stops the crowd growing (DESIGN.md "Requests", Expand the stadium). */
export function nearCapacity(world: World, club: Club): boolean {
  return attendanceOf(world, club) >= T.STADIUM_NEAR_CAPACITY * effectiveCapacity(world, club)
}

/** Solvent: cash not in the red and the wage bill inside its budget (the bill is passed in; the director module owns it). */
export function isSolvent(club: Club, wageBill: number): boolean {
  return club.cash >= 0 && wageBill <= club.wageBudget * T.WAGE_OVERRUN_FACTOR
}

/** What the works cost: a share of the normal budget. */
export function expansionCost(normalBudget: number): number {
  return round1(normalBudget * T.STADIUM_COST_SHARE)
}

/** The works begin: the cost off the pot first and cash after; capacity is cut for the season and rises at its end; wealth follows. */
export function beginExpansion(world: World, club: Club, cost: number): StadiumExpansion {
  const fromPot = Math.min(club.transferPot, cost)
  club.transferPot = round1(club.transferPot - fromPot)
  club.cash = round1(club.cash - (cost - fromPot))
  const from = club.stadium.capacity
  const to = Math.round((from * (1 + T.STADIUM_EXPANSION_SHARE)) / T.STADIUM_CAPACITY_STEP) * T.STADIUM_CAPACITY_STEP
  const expansion: StadiumExpansion = { season: world.season, from, to, wealthSeasonsLeft: T.STADIUM_WEALTH_SEASONS }
  club.stadium.expansion = expansion
  return expansion
}

/** Income from the seats past works added: onto the summer pot. */
export function stadiumIncome(club: Club): number {
  return round1((club.stadium.added ?? 0) * T.STADIUM_INCOME_PER_K)
}

/** Season's end: the works finish, and wealth rises for the seasons promised. */
export function settleStadiums(world: World): void {
  for (const club of world.clubs) {
    const e = club.stadium.expansion
    if (!e) continue
    if (club.stadium.capacity === e.from && e.to !== e.from) {
      club.stadium.capacity = e.to
      club.stadium.added = round1((club.stadium.added ?? 0) + (e.to - e.from))
      emit(world, 'stadium.expanded', { clubId: club.id, managerId: club.managerId, from: e.from, to: e.to, attendance: attendanceOf(world, club), season: world.season })
    }
    if (e.wealthSeasonsLeft > 0) {
      e.wealthSeasonsLeft--
      club.wealth = Math.round(clamp(club.wealth + T.STADIUM_WEALTH_PER_SEASON, 0, 100))
    }
  }
}

/** A home club's levels, or null for a generated opponent, which sits at neutral. */
export function levelsOf(world: World, clubId: number): ClubLevels | null {
  const club = world.clubs[clubId - 1]
  return club && club.id === clubId ? club.levels : null
}

/** A level up (a granted request): the director sharpens with scouting; the rest is read where it acts. */
export function raiseLevel(world: World, club: Club, name: LevelName): number {
  const from = club.levels[name]
  const to = Math.min(T.LEVEL_MAX, from + 1)
  club.levels[name] = to
  if (name === 'scouting' && to !== from) {
    club.director.judgement = Math.round(clamp(club.director.judgement + T.DIRECTOR_JUDGEMENT_PER_SCOUTING_LEVEL, T.DIRECTOR_JUDGEMENT_RANGE[0], T.DIRECTOR_JUDGEMENT_RANGE[1]))
  }
  emit(world, 'club.level', { clubId: club.id, managerId: club.managerId, level: name, from, to, judgement: club.director.judgement, season: world.season })
  return to
}

/** Saves from before the levels and the stadium: both from wealth, tier and prestige, deterministically. */
export function ensureFacilities(world: World): void {
  for (const club of world.clubs) {
    if (!club.levels) club.levels = levelsFor(club.wealth)
    if (!club.stadium) club.stadium = stadiumFor(club.tier, club.prestige)
    if (club.stadium.added === undefined) club.stadium.added = 0
  }
}
