import { rngFromState } from '../rng.js'
import { T } from '../tunables.js'
import type { HumanInputs, World } from '../types.js'
import { seasonOf, seasonWeek } from '../season/calendar.js'
import { playWeek, startSeason } from '../season/season.js'
import * as tenure from '../tenure/hooks.js'
import { closeWeekHooks } from './week.js'
import { advanceTurn } from './turn.js'

/**
 * Advance the world by one week. For a simulation this is the only entry
 * point that mutates time, and its order is fixed: the validation targets
 * depend on it. A career goes through the turn loop instead, with the
 * human's inputs applied first, and finishes the whole week.
 */
export function advanceWeek(world: World, inputs: HumanInputs = {}): void {
  if (world.human) {
    advanceTurn(world, inputs, { wholeWeek: true })
    return
  }
  const rng = rngFromState(world.rng)
  const sw = seasonWeek(world.week)
  if (sw === 0) startSeason(world, rng)
  if (sw < T.MATCH_WEEKS) {
    const played = playWeek(world, rng, sw)
    tenure.afterMatches(world, rng, played)
  }
  closeWeekHooks(world, rng, sw)
  world.week++
  world.season = seasonOf(world.week)
}

export function runWeeks(world: World, weeks: number): void {
  for (let i = 0; i < weeks; i++) advanceWeek(world)
}

export function runSeasons(world: World, seasons: number): void {
  runWeeks(world, seasons * T.SEASON_WEEKS)
}
