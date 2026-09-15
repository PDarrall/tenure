import { rngFromState } from '../rng.js'
import { T } from '../tunables.js'
import type { World } from '../types.js'
import { isMonthly, seasonOf, seasonWeek } from '../season/calendar.js'
import { endSeason, playWeek, startSeason, summerWindow, winterWindow } from '../season/season.js'
import { managerById, spellOf } from '../lookup.js'
import * as tenure from '../tenure/hooks.js'
import * as market from '../market/hooks.js'

function extrasFor(world: World) {
  return (managerId: number) => {
    const spell = spellOf(world, managerById(world, managerId))
    return spell
      ? { expectation: spell.expectation, fallouts: spell.season.fallouts, boardRows: spell.season.boardRows }
      : { expectation: 0, fallouts: 0, boardRows: 0 }
  }
}

/** Advance the world by one week. The only entry point that mutates time. */
export function advanceWeek(world: World): void {
  const rng = rngFromState(world.rng)
  const sw = seasonWeek(world.week)
  if (sw === 0) startSeason(world, rng)
  if (sw < T.MATCH_WEEKS) {
    const played = playWeek(world, rng, sw)
    tenure.afterMatches(world, rng, played)
  }
  if (isMonthly(sw)) {
    tenure.monthly(world, rng)
    market.monthly(world, rng)
  }
  if (sw === T.WINTER_WINDOW_WEEK) tenure.afterWinterWindow(world, winterWindow(world))
  if (sw === T.MATCH_WEEKS) {
    tenure.seasonEnd(world, endSeason(world, rng, extrasFor(world)))
    market.seasonEnd(world, rng)
  }
  if (sw === T.SUMMER_WINDOW_WEEK) tenure.afterSummerWindow(world, summerWindow(world, (clubId) => tenure.budgetMultiplierFor(world, clubId)))
  tenure.weekly(world, rng)
  market.weekly(world, rng)
  world.week++
  world.season = seasonOf(world.week)
}

export function runWeeks(world: World, weeks: number): void {
  for (let i = 0; i < weeks; i++) advanceWeek(world)
}

export function runSeasons(world: World, seasons: number): void {
  runWeeks(world, seasons * T.SEASON_WEEKS)
}
