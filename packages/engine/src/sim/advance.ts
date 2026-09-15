import { rngFromState } from '../rng.js'
import * as T from '../tunables.js'
import type { World } from '../types.js'
import { seasonOf, seasonWeek } from '../season/calendar.js'
import { endSeason, playWeek, startSeason, summerWindow, winterWindow } from '../season/season.js'

/** Advance the world by one week. The only entry point that mutates time. */
export function advanceWeek(world: World): void {
  const rng = rngFromState(world.rng)
  const sw = seasonWeek(world.week)
  if (sw === 0) startSeason(world, rng)
  if (sw < T.MATCH_WEEKS) playWeek(world, rng, sw)
  if (sw === T.WINTER_WINDOW_WEEK) winterWindow(world)
  if (sw === T.MATCH_WEEKS) endSeason(world, rng)
  if (sw === T.SUMMER_WINDOW_WEEK) summerWindow(world)
  world.week++
  world.season = seasonOf(world.week)
}

export function runWeeks(world: World, weeks: number): void {
  for (let i = 0; i < weeks; i++) advanceWeek(world)
}

export function runSeasons(world: World, seasons: number): void {
  runWeeks(world, seasons * T.SEASON_WEEKS)
}
