import { emit } from '../events.js'
import * as T from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import type { Club, ClubId, Tier, World } from '../types.js'
import { tableFor } from './table.js'
import { managerAt } from '../lookup.js'
import { awardPromotionPoints, awardTrophyPoints } from '../scoring/score.js'

export interface LeagueOutcome {
  /** Final position per home club, within the tier it played in. */
  finish: Map<ClubId, number>
  /** Tier each club played in this season. */
  playedTier: Map<ClubId, Tier>
  promoted: Set<ClubId>
  relegated: Set<ClubId>
  champions: Map<Tier, ClubId>
}

export function awardHonour(world: World, club: Club, competition: 'league' | 'nationalCup' | 'leagueCup' | 'european', tier?: Tier): void {
  const honour = tier === undefined ? { season: world.season, competition, clubId: club.id } : { season: world.season, competition, clubId: club.id, tier }
  club.honours.push(honour)
  const manager = managerAt(world, club)
  if (manager) {
    manager.history.honours.push({ ...honour })
    awardTrophyPoints(world, manager, honour)
  }
  emit(world, 'trophy', {
    clubId: club.id,
    managerId: manager ? manager.id : null,
    competition,
    tier: tier ?? null,
    season: world.season,
  })
}

function trophiesThisSeason(club: Club, season: number): number {
  return club.honours.filter((h) => h.season === season).length
}

/** Prestige a finish implies: top of the tier's range for first, bottom for last. */
export function impliedPrestige(tier: Tier, finish: number, size: number): number {
  const range = T.PRESTIGE_BY_TIER[tier - 1]
  if (!range) throw new Error(`no prestige range for tier ${tier}`)
  const share = size > 1 ? 1 - (finish - 1) / (size - 1) : 1
  return range[0] + (range[1] - range[0]) * share
}

/** Settle every division: titles, promotion, relegation, prestige and wealth drift, European places. */
export function settleLeagues(world: World): LeagueOutcome {
  const outcome: LeagueOutcome = {
    finish: new Map(),
    playedTier: new Map(),
    promoted: new Set(),
    relegated: new Set(),
    champions: new Map(),
  }
  const byId = new Map(world.clubs.map((c) => [c.id, c]))
  const moves: { club: Club; to: Tier }[] = []

  for (let index = 0; index < T.TIER_SIZES.length; index++) {
    const tier = (index + 1) as Tier
    const table = tableFor(world, tier)
    table.forEach((row, i) => {
      outcome.finish.set(row.clubId, i + 1)
      outcome.playedTier.set(row.clubId, tier)
    })
    const champion = byId.get((table[0] as { clubId: ClubId }).clubId) as Club
    outcome.champions.set(tier, champion.id)
    awardHonour(world, champion, 'league', tier)

    if (tier > 1) {
      for (const row of table.slice(0, T.UP_DOWN_PER_BOUNDARY)) {
        outcome.promoted.add(row.clubId)
        moves.push({ club: byId.get(row.clubId) as Club, to: (tier - 1) as Tier })
      }
    }
    if (tier < T.TIER_SIZES.length) {
      for (const row of table.slice(table.length - T.UP_DOWN_PER_BOUNDARY)) {
        outcome.relegated.add(row.clubId)
        moves.push({ club: byId.get(row.clubId) as Club, to: (tier + 1) as Tier })
      }
    }

    // Prestige follows results slowly; wealth follows prestige.
    for (const row of table) {
      const club = byId.get(row.clubId) as Club
      const finish = outcome.finish.get(club.id) as number
      const target = impliedPrestige(tier, finish, table.length) + T.PRESTIGE_TROPHY_BONUS * trophiesThisSeason(club, world.season)
      club.prestige = Math.round(clamp(club.prestige + T.PRESTIGE_DRIFT_RATE * (target - club.prestige), 0, 100))
      club.wealth = Math.round(clamp(club.wealth + T.WEALTH_DRIFT_RATE * (club.prestige - club.wealth), 0, 100))
      club.wageBudget = round1(T.WAGE_BUDGET_PER_WEALTH_SQ * club.wealth * club.wealth)
    }
  }

  for (const { club, to } of moves) {
    const from = club.tier
    club.tier = to
    if (to > from) club.lastRelegatedSeason = world.season
    if (to < from) {
      const manager = managerAt(world, club)
      if (manager) awardPromotionPoints(world, manager, from, outcome.champions.get(from) === club.id)
    }
    emit(world, to < from ? 'promotion' : 'relegation', {
      clubId: club.id,
      managerId: club.managerId,
      fromTier: from,
      toTier: to,
      finish: outcome.finish.get(club.id),
      season: world.season,
    })
  }

  // European places for next season: top N of tier 1 plus the cup winner.
  const topTier = tableFor(world, 1).map((r) => r.clubId)
  const cupWinner = world.cups.find((c) => c.competition === 'nationalCup')?.winnerId ?? null
  const entrants = topTier.slice(0, T.EUROPEAN_LEAGUE_PLACES)
  if (cupWinner !== null && !entrants.includes(cupWinner) && byId.get(cupWinner)?.tier === 1) entrants.push(cupWinner)
  else entrants.push(...topTier.slice(T.EUROPEAN_LEAGUE_PLACES, T.EUROPEAN_LEAGUE_PLACES + 1))
  world.europeanEntrants = entrants

  return outcome
}
