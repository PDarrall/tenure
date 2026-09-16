/**
 * The end of a week, shared by the simulation and the career loop: monthly
 * rolls, windows, the season's end, salaries, the board's roll and the
 * market. The order here is the simulation's; the career loop calls it
 * after the last football of the week.
 */
import type { Rng } from '../rng.js'
import { T } from '../tunables.js'
import type { World } from '../types.js'
import { isMonthly } from '../season/calendar.js'
import { endSeason, summerWindow, winterWindow } from '../season/season.js'
import { managerById, spellOf } from '../lookup.js'
import * as tenure from '../tenure/hooks.js'
import * as market from '../market/hooks.js'

export function extrasFor(world: World) {
  return (managerId: number) => {
    const spell = spellOf(world, managerById(world, managerId))
    return spell
      ? { expectation: spell.expectation, fallouts: spell.season.fallouts, boardRows: spell.season.boardRows }
      : { expectation: 0, fallouts: 0, boardRows: 0 }
  }
}

/** Everything a week does after its matches, before the clock moves. */
export function closeWeekHooks(world: World, rng: Rng, sw: number): void {
  if (isMonthly(sw)) {
    tenure.monthly(world, rng)
    market.monthly(world, rng)
  }
  if (sw === T.WINTER_WINDOW_WEEK - 1) tenure.queueWindowDecision(world, false)
  if (sw === T.WINTER_WINDOW_WEEK) tenure.afterWinterWindow(world, winterWindow(world))
  if (sw === T.MATCH_WEEKS) {
    tenure.seasonEnd(world, endSeason(world, rng, extrasFor(world)))
    market.seasonEnd(world, rng)
    tenure.queueWindowDecision(world, true)
  }
  if (sw === T.SUMMER_WINDOW_WEEK) tenure.afterSummerWindow(world, summerWindow(world, (clubId) => tenure.budgetMultiplierFor(world, clubId)))
  tenure.weekly(world, rng)
  market.weekly(world, rng)
}
