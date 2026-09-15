import { T } from '../tunables.js'

/** Week within the season, 0-based. */
export function seasonWeek(week: number): number {
  return week % T.SEASON_WEEKS
}

/** 1-based season number for a global week. */
export function seasonOf(week: number): number {
  return Math.floor(week / T.SEASON_WEEKS) + 1
}

/** Season week a league round (0-based) falls in, spread evenly over the match weeks. */
export function leagueRoundWeek(round: number, rounds: number): number {
  return Math.floor((round * T.MATCH_WEEKS) / rounds)
}

/** True on the weeks a "monthly" roll happens, during the playing season. */
export function isMonthly(seasonWk: number): boolean {
  return seasonWk > 0 && seasonWk % T.MONTH_WEEKS === 0 && seasonWk < T.MATCH_WEEKS
}

/** Whole contract years remaining from a global week to an end week, rounded up. */
export function yearsRemaining(week: number, endWeek: number): number {
  return Math.max(0, Math.ceil((endWeek - week) / T.SEASON_WEEKS))
}
