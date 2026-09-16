import { T } from '../tunables.js'
import type { ManagerId, World } from '../types.js'
import { createWorld } from '../world/gen.js'
import { seasonWeek } from '../season/calendar.js'
import { advanceWeek } from './advance.js'
import { countLongTopTierTenures, populationStats, trackedManagers, type PopulationStats } from '../stats/population.js'

export interface RunOptions {
  seed: number
  /** Careers to follow: the first N managers hired after genesis. */
  careers: number
  /** Safety cap on seasons simulated. */
  maxYears: number
  /** Called after each season with the world, for progress. */
  onSeason?: (world: World, tracked: number, ended: number) => void
}

export interface RunResult {
  world: World
  tracked: ManagerId[]
  stats: PopulationStats
}

/**
 * Run a world until the first `careers` post-genesis careers have all
 * ended, or the year cap. Samples the top-tier long-tenure count at every
 * season end after the warm-up.
 */
export function runCareers(options: RunOptions): RunResult {
  const world = createWorld(options.seed)
  const tracked: ManagerId[] = []
  const trackedSet = new Set<ManagerId>()
  const samples: number[] = []

  for (let week = 0; week < options.maxYears * T.SEASON_WEEKS; week++) {
    const sw = seasonWeek(world.week)
    if (sw === T.MATCH_WEEKS && world.season > T.VALIDATION_WARM_UP_SEASONS) samples.push(countLongTopTierTenures(world))
    advanceWeek(world)
    if (seasonWeek(world.week) !== 0) continue

    if (tracked.length < options.careers) {
      for (const m of trackedManagers(world)) {
        if (tracked.length >= options.careers) break
        if (!trackedSet.has(m.id)) {
          trackedSet.add(m.id)
          tracked.push(m.id)
        }
      }
    }
    const ended = tracked.filter((id) => world.managers[id - 1]?.status.kind === 'retired').length
    options.onSeason?.(world, tracked.length, ended)
    if (tracked.length >= options.careers && ended === tracked.length) break
  }

  return { world, tracked, stats: populationStats(world, tracked, samples) }
}
