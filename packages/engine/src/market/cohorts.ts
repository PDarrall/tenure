import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import * as T from '../tunables.js'
import { makeEntrant } from '../managers/gen.js'
import { ManagerNamer } from '../managers/names.js'
import type { World } from '../types.js'

/** Each summer, top the working population back up to POPULATION with new entrants. */
export function joinCohort(world: World, rng: Rng): number {
  if (!T.COHORT_TOP_UP) return 0
  const active = world.managers.filter((m) => m.status.kind !== 'retired').length
  const needed = Math.max(0, T.POPULATION - active)
  if (needed === 0) return 0
  const namer = new ManagerNamer(rng, world.managers.map((m) => m.name))
  for (let i = 0; i < needed; i++) {
    const entrant = makeEntrant(rng, namer, world.nextManagerId++, world.season)
    entrant.status = { kind: 'unemployed', sinceWeek: world.week, activity: 'wait', monthsSinceShortlisted: 0 }
    world.managers.push(entrant)
  }
  emit(world, 'cohort.joined', { season: world.season, count: needed, population: world.managers.filter((m) => m.status.kind !== 'retired').length })
  return needed
}
