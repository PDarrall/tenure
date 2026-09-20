import { T } from '../tunables.js'

/** Week within the season, 0-based. */
export function seasonWeek(week: number): number {
  return week % T.SEASON_WEEKS
}

/** 1-based season number for a global week. */
export function seasonOf(week: number): number {
  return Math.floor(week / T.SEASON_WEEKS) + 1
}

/** True on the weeks a "monthly" roll happens, during the playing season. */
export function isMonthly(seasonWk: number): boolean {
  return seasonWk > 0 && seasonWk % T.MONTH_WEEKS === 0 && seasonWk < T.MATCH_WEEKS
}

/** Whole contract years remaining from a global week to an end week, rounded up. */
export function yearsRemaining(week: number, endWeek: number): number {
  return Math.max(0, Math.ceil((endWeek - week) / T.SEASON_WEEKS))
}

/** The two slots of a week (DESIGN.md "World"): the weekend, then the midweek. */
export const SLOTS: readonly (0 | 1)[] = [0, 1]

export function slotLabel(slot: 0 | 1): string {
  return slot === 0 ? 'weekend' : 'midweek'
}
