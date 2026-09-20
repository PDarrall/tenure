/**
 * The three numbers (DESIGN.md "The score") and the Legacy composite.
 * Points are awarded the moment they are won, so a manager sacked after a
 * cup final keeps them. Nothing is ever deducted.
 */
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { round1 } from '../world/gen.js'
import { spellOf } from '../lookup.js'
import type { Honour, Manager, Tier, World } from '../types.js'

export function trophyPointsFor(honour: Honour): number {
  switch (honour.competition) {
    case 'championsCup':
      return T.TROPHY_POINTS.championsCup
    case 'europaCup':
      return T.TROPHY_POINTS.europaCup
    case 'conferenceCup':
      return T.TROPHY_POINTS.conferenceCup
    case 'nationalCup':
      return T.TROPHY_POINTS.nationalCup
    case 'leagueCup':
      return T.TROPHY_POINTS.leagueCup
    case 'league':
      return honour.tier === undefined ? 0 : (T.TROPHY_POINTS.leagueByTier[honour.tier - 1] ?? 0)
  }
}

/** Points for going up without the title, by the tier promoted from. */
export function promotionPointsFrom(tier: Tier): number {
  return T.TROPHY_POINTS.promotionFromTier[tier - 2] ?? 0
}

export function legacy(games: number, earnings: number, trophyPoints: number, playersMade = 0): number {
  const w = T.LEGACY_WEIGHTS
  return round1(games * w.games + earnings * w.earnings + trophyPoints * w.trophyPoints + playersMade * w.playersMade)
}

export interface Score {
  games: number
  earnings: number
  trophyPoints: number
  /** The fourth line (DESIGN.md "Your players"). */
  playersMade: number
  legacy: number
}

export function careerScore(manager: Manager): Score {
  const games = manager.history.games
  const earnings = round1(manager.history.earnings)
  const trophyPoints = manager.history.trophyPoints
  const playersMade = Math.round(manager.history.playersMade * 10) / 10
  return { games, earnings, trophyPoints, playersMade, legacy: legacy(games, earnings, trophyPoints, playersMade) }
}

function bonus(world: World, manager: Manager, share: number, reason: string): void {
  const spell = spellOf(world, manager)
  if (!spell) return
  const amount = round1(spell.contract.salary * share * 100) / 100
  if (amount <= 0) return
  manager.history.earnings += amount
  emit(world, 'earnings.bonus', { managerId: manager.id, spellId: spell.id, amount, reason, season: world.season })
}

/** A trophy: points on the board and a bonus in the bank. */
export function awardTrophyPoints(world: World, manager: Manager, honour: Honour): number {
  const points = trophyPointsFor(honour)
  manager.history.trophyPoints += points
  emit(world, 'score.trophyPoints', {
    managerId: manager.id,
    competition: honour.competition,
    tier: honour.tier ?? null,
    points,
    total: manager.history.trophyPoints,
    season: world.season,
  })
  bonus(world, manager, T.TROPHY_BONUS_SHARE, `trophy ${honour.competition}`)
  return points
}

/** Promotion: points only when it came without the title (the title already paid). */
export function awardPromotionPoints(world: World, manager: Manager, fromTier: Tier, withTitle: boolean): number {
  bonus(world, manager, T.PROMOTION_BONUS_SHARE, 'promotion')
  if (withTitle) return 0
  const points = promotionPointsFrom(fromTier)
  manager.history.trophyPoints += points
  emit(world, 'score.trophyPoints', {
    managerId: manager.id,
    competition: 'promotion',
    tier: fromTier,
    league: null,
    points,
    total: manager.history.trophyPoints,
    season: world.season,
  })
  return points
}
